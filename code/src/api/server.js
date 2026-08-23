// src/api/server.js
//
// The HTTP API: the same pipeline again, this time for an interface. It exists
// so a phone or web app reimplements nothing, and it inherits the property the
// other surfaces have — there is no endpoint that executes live. It listens on
// 127.0.0.1 unless told otherwise.

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from '../config.js'
import { CerrojoError } from '../errors.js'
import { formatearMonto } from '../ingest/amount.js'
import { construirPoliticas } from '../policy/index.js'
import { LedgerDiario } from '../policy/ledger.js'
import { abrirSesion } from '../wdk/session.js'
import { correr } from '../run.js'

/**
 * It consumes exactly the same layers as the CLI and the MCP server, and keeps
 * the same property: **no endpoint executes live**. Everything is dry-run.
 *
 * To test from a phone on the same network, start it with
 * CERROJO_API_HOST=0.0.0.0 — and only on a network you trust.
 */
export function crearApi ({ cfg = cargarConfig() } = {}) {
  const rutas = [
    ['GET', /^\/salud$/, salud],
    ['GET', /^\/politicas$/, politicas],
    ['GET', /^\/estado-diario$/, estadoDiario],
    ['POST', /^\/simular$/, simular],
    ['POST', /^\/correr$/, correrNomina],
    ['GET', /^\/corridas\/([\w:.-]+)$/, recibo]
  ]

  const servidor = createServer(async (req, res) => {
    // CORS is open: the API listens locally only and exposes no write at all.
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')

    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }

    const url = new URL(req.url, 'http://localhost')

    for (const [metodo, patron, manejador] of rutas) {
      const m = url.pathname.match(patron)
      if (!m || req.method !== metodo) continue

      try {
        const cuerpo = req.method === 'POST' ? await leerJSON(req) : {}
        const salida = await manejador({ cfg, params: m.slice(1), cuerpo, url })
        return responder(res, 200, salida)
      } catch (err) {
        const tipado = err?.code && err?.suggestion
        return responder(res, tipado ? 400 : 500, {
          error: {
            code: err?.code ?? 'E_INTERNO',
            message: err?.message ?? String(err),
            suggestion: err?.suggestion ?? 'Revisa los logs del servidor y la configuracion en code/.env'
          }
        })
      }
    }

    responder(res, 404, { error: { code: 'E_NO_ENCONTRADO', message: `No existe ${req.method} ${url.pathname}`, suggestion: 'Endpoints: GET /salud, GET /politicas, GET /estado-diario, POST /simular, POST /correr, GET /corridas/:runId' } })
  })

  return servidor
}

async function salud ({ cfg }) {
  return {
    ok: true,
    servicio: 'cerrojo',
    version: '0.1.0',
    red: cfg.network,
    token: cfg.token,
    modo: 'dry-run',
    nota: 'Esta API no puede enviar fondos. No existe un endpoint que ejecute en vivo.'
  }
}

async function politicas ({ cfg }) {
  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })

  const lista = construirPoliticas({
    wallet: cfg.network,
    capTx: cfg.capTx,
    capDay: cfg.capDay,
    allowlist,
    token: cfg.token,
    ledger
  })

  return {
    red: cfg.network,
    token: cfg.token,
    topePorTransferencia: { base: cfg.capTx.toString(), legible: formatearMonto(cfg.capTx, cfg.token.decimals) },
    topeDiario: { base: cfg.capDay.toString(), legible: formatearMonto(cfg.capDay, cfg.token.decimals) },
    destinatariosPermitidos: allowlist.length,
    politicas: lista.map((p) => ({
      id: p.id,
      nombre: p.name,
      reglas: p.rules.map((r) => ({ nombre: r.name, accion: r.action, operacion: r.operation, razon: r.reason ?? null }))
    }))
  }
}

async function estadoDiario ({ cfg }) {
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })

  return {
    fecha: ledger.fecha,
    red: cfg.network,
    gastado: { base: ledger.gastado.toString(), legible: formatearMonto(ledger.gastado, cfg.token.decimals) },
    tope: { base: cfg.capDay.toString(), legible: formatearMonto(cfg.capDay, cfg.token.decimals) },
    restante: { base: ledger.restante(cfg.capDay).toString(), legible: formatearMonto(ledger.restante(cfg.capDay), cfg.token.decimals) },
    movimientos: ledger.movimientos.length
  }
}

async function simular ({ cfg, cuerpo }) {
  // Input is validated before anything is touched: an unreadable amount is the
  // caller being wrong, not a 500 of ours.
  const destinatario = String(cuerpo.destinatario ?? '')
  const montoBase = String(cuerpo.monto_base ?? '')

  if (!/^0x[0-9a-fA-F]{40}$/.test(destinatario)) {
    throw new CerrojoError('E_DESTINATARIO_INVALIDO', `"${destinatario}" no tiene la forma de una direccion EVM.`, 'Envia destinatario como 0x seguido de 40 caracteres hexadecimales.', 'api')
  }

  if (!/^\d+$/.test(montoBase)) {
    throw new CerrojoError('E_MONTO_INVALIDO', `"${montoBase}" no es un entero en unidades base.`, `Envia monto_base como entero en unidades base: con ${cfg.token.decimals} decimales, 250 ${cfg.token.symbol} son "250000000".`, 'api')
  }

  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
  const sesion = await abrirSesion({ seed: leerSeed(), cfg, ledger, allowlist })

  try {
    const verdicto = await sesion.cuenta.simulate.transfer({
      token: cuerpo.token ?? cfg.token.address,
      recipient: destinatario,
      amount: BigInt(montoBase)
    })

    return {
      decision: verdicto.decision,
      politica: verdicto.policy_id,
      regla: verdicto.matched_rule,
      razon: verdicto.reason,
      monto: { base: montoBase, legible: formatearMonto(montoBase, cfg.token.decimals) },
      traza: verdicto.trace
    }
  } finally {
    sesion.cerrar()
  }
}

async function correrNomina ({ cfg, cuerpo }) {
  const csv = cuerpo.csv
    ? (cuerpo.csv.includes(':') || cuerpo.csv.startsWith('/') ? cuerpo.csv : join(RAIZ, cuerpo.csv))
    : cfg.csvPorDefecto

  const { recibo, markdown } = await correr({
    csv,
    instruccion: cuerpo.instruccion ?? 'paga la nomina',
    modo: 'dry-run', // no hay forma de pedir 'live' por HTTP. A proposito.
    planner: cuerpo.planner === 'llm' ? 'llm' : 'rules',
    conDemo: Boolean(cuerpo.demo),
    // Poner el acumulado del dia en cero antes de correr. Es lo unico que esta
    // API puede relajar, y solo afloja un contador nuestro: los topes, la
    // allowlist y el token siguen decidiendo igual. Sin esto, la segunda persona
    // que abre la demo encuentra el dia gastado y todo denegado por `cap-diario`,
    // que es correcto y no se entiende.
    resetDia: Boolean(cuerpo.reiniciar_dia),
    cfg
  })

  return { recibo, markdown }
}

async function recibo ({ cfg, params }) {
  const crudo = readFileSync(join(cfg.dirRuns, params[0], 'recibo.json'), 'utf8')
  return JSON.parse(crudo)
}

function responder (res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo, null, 2)
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
  res.end(texto)
}

function leerJSON (req) {
  return new Promise((resolver, rechazar) => {
    let datos = ''
    req.on('data', (c) => {
      datos += c
      if (datos.length > 1_000_000) { rechazar(new Error('cuerpo demasiado grande')); req.destroy() }
    })
    req.on('end', () => {
      if (!datos.trim()) return resolver({})
      try { resolver(JSON.parse(datos)) } catch (err) { rechazar(new Error(`JSON invalido: ${err.message}`)) }
    })
    req.on('error', rechazar)
  })
}
