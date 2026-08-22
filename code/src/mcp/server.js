#!/usr/bin/env node
import { join } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from '../config.js'
import { formatearMonto } from '../ingest/amount.js'
import { construirPoliticas } from '../policy/index.js'
import { LedgerDiario } from '../policy/ledger.js'
import { abrirSesion } from '../wdk/session.js'
import { correr } from '../run.js'
import { reciboMarkdown } from '../receipt/markdown.js'

/**
 * Cerrojo como servidor MCP: la misma tuberia, para un agente en vez de un humano.
 *
 * Lo que un agente conectado aqui **no** puede hacer, por construccion:
 *   - enviar de verdad: no hay herramienta que ejecute en vivo. Todo es dry-run.
 *   - pasarse de un tope: la decision la toma el motor de politicas de WDK, no el prompt.
 *   - ver la seed: ninguna herramienta la devuelve, ni siquiera parcialmente.
 *
 * Es el mismo argumento del proyecto aplicado al canal de agentes: el cerrojo no
 * vive en las instrucciones que lee el modelo.
 */
const cfg = cargarConfig()

const servidor = new McpServer(
  { name: 'cerrojo', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

const texto = (t) => ({ content: [{ type: 'text', text: t }] })

async function conSesion (fn) {
  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
  const sesion = await abrirSesion({ seed: leerSeed(), cfg, ledger, allowlist })
  try {
    return await fn({ sesion, ledger, allowlist })
  } finally {
    sesion.cerrar()
  }
}

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
      csv: z.string().optional().describe('Ruta al CSV. Por defecto, data/nomina_agosto.csv'),
      instruccion: z.string().optional().describe('Instruccion del operador, en lenguaje natural'),
      formato: z.enum(['markdown', 'json']).optional().describe('Formato del recibo devuelto')
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  async ({ csv, instruccion, formato = 'markdown' }) => {
    const { recibo, markdown } = await correr({
      csv: csv ? (csv.startsWith('.') || csv.includes(':') ? csv : join(RAIZ, csv)) : join(RAIZ, 'data', 'nomina_agosto.csv'),
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
    try {
      const crudo = readFileSync(join(cfg.dirRuns, runId, 'recibo.json'), 'utf8')
      return texto(reciboMarkdown(JSON.parse(crudo)))
    } catch {
      return texto(`No hay recibo para la corrida ${runId} en ${cfg.dirRuns}.`)
    }
  }
)

const transporte = new StdioServerTransport()
await servidor.connect(transporte)
