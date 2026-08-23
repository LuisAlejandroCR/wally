#!/usr/bin/env node
// src/mcp/server.js
//
// Cerrojo as an MCP server: the same pipeline, aimed at an agent instead of a
// person. The tools an agent gets here can read, quote and propose; the one it
// does not get is approve. Everything a payment needs in order to move still has
// to pass a human and then the policy engine, in that order.

import { realpathSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from '../config.js'
import { formatearMonto } from '../ingest/amount.js'
import { construirPoliticas } from '../policy/index.js'
import { LedgerDiario } from '../policy/ledger.js'
import { abrirSesion } from '../wdk/session.js'
import { estimarComision, panelMainnet } from '../execute/index.js'
import { Vales } from '../vales.js'
import { correr } from '../run.js'
import { reciboMarkdown } from '../receipt/markdown.js'

/**
 * What an agent connected here **cannot** do, by construction:
 *   - actually send: no tool signs or executes live.
 *   - **approve its own proposal**: no tool approves a voucher. Approving exists
 *     only in the CLI, where a person types it. That asymmetry is the safety
 *     model — a prompt cannot pay itself.
 *   - go over a cap: the decision belongs to WDK's policy engine, not the prompt.
 *   - see the seed: no tool returns it, not even in part.
 *
 * What it can do: read balances, quote a fee, simulate a payment against the
 * policies, and leave a proposed voucher for a human to approve.
 *
 * Same argument as the rest of the project, applied to the agent channel: the
 * lock does not live in the instructions the model reads. Tool descriptions stay
 * in Spanish, matching the engine's own voice — the display layer translates.
 */
const cfg = cargarConfig()

/**
 * The two tools that take a path take it from a stranger.
 *
 * Over stdio the caller is the person who started the process, so a path is just
 * a path. Over Streamable HTTP the caller is anonymous, and `join()` on an
 * argument is a file read: `../` walks out of the project, and a CSV that parses
 * comes back inside the receipt's `concepto` column. So both arguments are
 * resolved and then required to land inside the project — the fixtures, the
 * payroll data and the runs all do, and nothing outside has any business being
 * read by an MCP client.
 */
function dentroDelProyecto (ruta) {
  const abs = isAbsolute(ruta) ? resolve(ruta) : resolve(RAIZ, ruta)
  return abs === RAIZ || abs.startsWith(RAIZ + sep) ? abs : null
}

/** A run id is a name, never a path: no separators, no dots that walk. */
const RUN_ID = /^[A-Za-z0-9_-]+$/

/**
 * Builds a server with the nine tools registered, ready for any transport.
 *
 * A factory rather than a module-level singleton because the HTTP transport is
 * stateless and wants one server per request: sharing a single instance across
 * callers makes the second request fail, and would put two strangers on the same
 * connection if it did not. Over stdio the process builds exactly one and that
 * is the end of it.
 */
export function crearServidor () {
  const servidor = new McpServer(
    { name: 'cerrojo', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  const texto = (t) => ({ content: [{ type: 'text', text: t }] })

  const vales = new Vales({ dir: cfg.dirEstado })

  async function conSesion (fn, { conDemo = false } = {}) {
    const allowlist = cargarAllowlist(cfg.allowlistPath)
    const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
    const sesion = await abrirSesion({ seed: leerSeed(), cfg, ledger, allowlist, conDemo })
    try {
      return await fn({ sesion, ledger, allowlist })
    } finally {
      sesion.cerrar()
    }
  }

  const legible = (base) => `${formatearMonto(BigInt(base), cfg.token.decimals)} ${cfg.token.symbol}`

  servidor.registerTool(
    'cerrojo_politicas',
    {
      title: 'Politicas activas',
      description: 'Lista las politicas que gobiernan la tesoreria: topes, allowlist y token permitido. Solo lectura.',
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    async () => {
      const allowlist = cargarAllowlist(cfg.allowlistPath)
      const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
      const politicas = construirPoliticas({
        wallet: cfg.network,
        capTx: cfg.capTx,
        capDay: cfg.capDay,
        allowlist,
        token: cfg.token,
        ledger
      })

      const detalle = politicas.map((p) => ({
        id: p.id,
        nombre: p.name,
        reglas: p.rules.map((r) => ({ nombre: r.name, accion: r.action, operacion: r.operation, razon: r.reason ?? null }))
      }))

      return texto(JSON.stringify({
        red: cfg.network,
        token: cfg.token,
        topePorTransferencia: cfg.capTx.toString(),
        topeDiario: cfg.capDay.toString(),
        gastadoHoy: ledger.gastado.toString(),
        destinatariosPermitidos: allowlist.length,
        politicas: detalle,
        nota: 'Toda operacion de escritura distinta de `transfer` esta denegada por defecto (default-deny del motor de WDK).'
      }, null, 2))
    }
  )

  servidor.registerTool(
    'cerrojo_simular_pago',
    {
      title: 'Simular un pago contra las politicas',
      description: 'Evalua un pago contra el motor de politicas SIN ejecutarlo y sin tocar la red. Devuelve ALLOW o DENY con el nombre de la politica, la regla y la razon.',
      inputSchema: {
        destinatario: z.string().describe('Direccion EVM del destinatario (0x...)'),
        monto_base: z.string().describe('Monto en unidades base enteras. Con 6 decimales, 250 USDT = "250000000"'),
        token: z.string().optional().describe('Contrato del token. Por defecto, el token de la nomina.')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ destinatario, monto_base: montoBase, token }) => conSesion(async ({ sesion }) => {
      const verdicto = await sesion.cuenta.simulate.transfer({
        token: token ?? cfg.token.address,
        recipient: destinatario,
        amount: BigInt(montoBase)
      })

      return texto(JSON.stringify({
        decision: verdicto.decision,
        politica: verdicto.policy_id,
        regla: verdicto.matched_rule,
        razon: verdicto.reason,
        monto_legible: `${formatearMonto(montoBase, cfg.token.decimals)} ${cfg.token.symbol}`,
        traza: verdicto.trace
      }, null, 2))
    })
  )

  servidor.registerTool(
    'cerrojo_correr_nomina',
    {
      title: 'Correr una nomina en dry-run',
      description: 'Toma un CSV de nomina y una instruccion, arma el plan, lo pasa por las politicas y devuelve el recibo. SIEMPRE en dry-run: este servidor no puede enviar fondos.',
      inputSchema: {
        csv: z.string().optional().describe('Ruta al CSV. Por defecto, evals/fixtures/nomina_agosto.csv'),
        instruccion: z.string().optional().describe('Instruccion del operador, en lenguaje natural'),
        formato: z.enum(['markdown', 'json']).optional().describe('Formato del recibo devuelto')
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ csv, instruccion, formato = 'markdown' }) => {
      const ruta = csv ? dentroDelProyecto(csv) : cfg.csvPorDefecto
      if (!ruta) {
        return texto(JSON.stringify({
          error: 'E_RUTA',
          mensaje: `La ruta "${csv}" queda fuera del proyecto.`,
          nota: 'Este servidor solo lee CSV que viven dentro del repositorio, por ejemplo evals/fixtures/nomina_agosto.csv.'
        }, null, 2))
      }

      const { recibo, markdown } = await correr({
        csv: ruta,
        instruccion: instruccion ?? 'paga la nomina',
        modo: 'dry-run', // no hay forma de pedir 'live' desde MCP. A proposito.
        planner: 'rules',
        cfg
      })

      return texto(formato === 'json' ? JSON.stringify(recibo, null, 2) : markdown)
    }
  )

  servidor.registerTool(
    'cerrojo_estado_diario',
    {
      title: 'Acumulado del dia',
      description: 'Cuanto se ha comprometido hoy contra el tope diario, y cuanto queda.',
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    async () => {
      const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
      return texto(JSON.stringify({
        fecha: ledger.fecha,
        red: cfg.network,
        gastado_base: ledger.gastado.toString(),
        tope_base: cfg.capDay.toString(),
        restante_base: ledger.restante(cfg.capDay).toString(),
        legible: `${formatearMonto(ledger.gastado, cfg.token.decimals)} / ${formatearMonto(cfg.capDay, cfg.token.decimals)} ${cfg.token.symbol}`,
        movimientos: ledger.movimientos.length
      }, null, 2))
    }
  )

  servidor.registerTool(
    'cerrojo_recibo_de',
    {
      title: 'Releer un recibo',
      description: 'Devuelve el recibo de una corrida anterior en markdown, por su runId.',
      inputSchema: { runId: z.string().describe('Identificador de la corrida, por ejemplo run_2026-08-22T14-03-11Z') },
      annotations: { readOnlyHint: true }
    },
    async ({ runId }) => {
      const { readFileSync } = await import('node:fs')
      if (!RUN_ID.test(runId)) {
        return texto(`"${runId}" no tiene forma de runId. Se ven asi: run_2026-08-22T14-03-11Z.`)
      }
      try {
        const crudo = readFileSync(join(cfg.dirRuns, runId, 'recibo.json'), 'utf8')
        return texto(reciboMarkdown(JSON.parse(crudo)))
      } catch {
        return texto(`No hay recibo para la corrida ${runId} en ${cfg.dirRuns}.`)
      }
    }
  )

  servidor.registerTool(
    'cerrojo_saldo',
    {
      title: 'Saldo de la tesoreria',
      description: 'Saldo nativo y de USDT en la tesoreria, en la red que ejecuta. Con incluir_mainnet ademas lee una red real en SOLO LECTURA. No mueve nada.',
      inputSchema: {
        incluir_mainnet: z.boolean().optional().describe('Agrega el panel de mainnet en solo lectura (saldos y tarifas reales)')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ incluir_mainnet: incluirMainnet = false }) => conSesion(async ({ sesion, ledger }) => {
      const ro = sesion.cuentaSoloLectura
      const [nativo, token] = await Promise.all([
        ro.getBalance().catch(() => null),
        ro.getTokenBalance(cfg.token.address).catch(() => null)
      ])

      const salida = {
        red: cfg.network,
        tesoreria: sesion.tesoreria,
        saldo_nativo_wei: nativo === null ? null : nativo.toString(),
        saldo_token_base: token === null ? null : token.toString(),
        saldo_token_legible: token === null ? null : legible(token),
        token: cfg.token,
        margen_hoy_base: ledger.restante(cfg.capDay).toString(),
        margen_hoy_legible: legible(ledger.restante(cfg.capDay)),
        nota: 'Lectura desde toReadOnlyAccount(): este objeto no tiene metodo de envio.'
      }

      if (incluirMainnet) salida.mainnet = await panelMainnet({ sesion, cfg })
      return texto(JSON.stringify(salida, null, 2))
    }, { conDemo: incluirMainnet })
  )

  servidor.registerTool(
    'cerrojo_cotizar',
    {
      title: 'Cotizar la comision de un pago',
      description: 'Estima lo que costaria en comision enviar un monto a un destinatario. No firma ni envia, y no crea ningun vale.',
      inputSchema: {
        destinatario: z.string().describe('Direccion EVM del destinatario (0x...)'),
        monto_base: z.string().describe('Monto en unidades base enteras. Con 6 decimales, 250 USDT = "250000000"')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ destinatario, monto_base: montoBase }) => conSesion(async ({ sesion }) => {
      const orden = { token: cfg.token.address, recipient: destinatario, amount: BigInt(montoBase) }
      const cotizacion = await estimarComision({ sesion, orden, cfg })

      return texto(JSON.stringify({
        red: cfg.network,
        destinatario,
        monto_base: montoBase,
        monto_legible: legible(montoBase),
        comision_wei: cotizacion.feeEstimada,
        exacta: cotizacion.quoteExacto,
        nota: cotizacion.quoteNota,
        aviso: 'Una cotizacion no es un permiso. El veredicto de politica se pide con cerrojo_simular_pago.'
      }, null, 2))
    })
  )

  servidor.registerTool(
    'cerrojo_proponer_pago',
    {
      title: 'Proponer un pago para que lo apruebe una persona',
      description: 'Evalua un pago contra las politicas y, si pasa, deja un VALE propuesto. No firma ni envia nada: un vale solo avanza cuando una persona lo aprueba desde la CLI, que es la unica parte del sistema donde existe aprobar.',
      inputSchema: {
        destinatario: z.string().describe('Direccion EVM del destinatario (0x...)'),
        monto_base: z.string().describe('Monto en unidades base enteras'),
        motivo: z.string().optional().describe('Para que es el pago, en una linea. Viaja con el vale y lo lee quien aprueba.')
      },
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ destinatario, monto_base: montoBase, motivo }) => conSesion(async ({ sesion }) => {
      const orden = { token: cfg.token.address, recipient: destinatario, amount: BigInt(montoBase) }
      const verdicto = await sesion.cuenta.simulate.transfer(orden)

      if (verdicto.decision !== 'ALLOW') {
        return texto(JSON.stringify({
          creado: false,
          decision: verdicto.decision,
          politica: verdicto.policy_id,
          regla: verdicto.matched_rule,
          razon: verdicto.reason,
          nota: 'No se crea vale para una orden denegada. Cambia la orden, no la politica.'
        }, null, 2))
      }

      const vale = vales.crear({
        orden: { recipient: destinatario, amount: montoBase },
        veredicto: verdicto,
        network: cfg.network,
        token: cfg.token,
        motivo: motivo ?? null
      })

      return texto(JSON.stringify({
        creado: true,
        vale: vale.id,
        estado: vale.estado,
        expira: vale.expira,
        monto_legible: legible(montoBase),
        destinatario,
        huella: vale.huella,
        siguiente_paso: `Una persona tiene que ejecutar en su terminal: cerrojo aprobar ${vale.id}`,
        nota: 'Este servidor no puede aprobar el vale. La aprobacion vuelve a pasar por las politicas, y sin --live --confirmo la ejecucion sigue siendo dry-run.'
      }, null, 2))
    })
  )

  servidor.registerTool(
    'cerrojo_estado_vale',
    {
      title: 'Estado de un vale',
      description: 'En que estado esta un vale: propuesto, aprobado, ejecutado, denegado, rechazado o expirado. Solo lectura: mirar un vale no lo mueve.',
      inputSchema: { vale: z.string().optional().describe('Id del vale. Sin id, lista los vales pendientes.') },
      annotations: { readOnlyHint: true }
    },
    async ({ vale: id }) => {
      if (!id) {
        const pendientes = vales.pendientes().map((v) => ({
          vale: v.id,
          destinatario: v.orden.recipient,
          monto_legible: legible(v.orden.amount),
          motivo: v.motivo,
          expira: v.expira
        }))
        return texto(JSON.stringify({ pendientes, total: pendientes.length }, null, 2))
      }

      const v = vales.leer(id)
      if (!v) return texto(JSON.stringify({ vale: id, existe: false }, null, 2))

      return texto(JSON.stringify({
        vale: v.id,
        existe: true,
        estado: v.estado,
        destinatario: v.orden.recipient,
        monto_legible: legible(v.orden.amount),
        motivo: v.motivo,
        creado: v.creado,
        expira: v.expira,
        aprobadoEn: v.aprobadoEn,
        resuelto: v.resuelto
      }, null, 2))
    }
  )

  return servidor
}

/**
 * Only take over stdin and stdout when this file *is* the program. Imported —
 * which is what `src/mcp/http.js` does — it hands back a built server and stays
 * out of the way, instead of silently swallowing the importer's stdio.
 */
function esElPrograma () {
  const entrada = process.argv[1]
  if (!entrada) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entrada)).href
  } catch {
    return false
  }
}

if (esElPrograma()) {
  const transporte = new StdioServerTransport()
  await crearServidor().connect(transporte)
}
