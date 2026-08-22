import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from '../config.js'
import { formatearMonto } from '../ingest/amount.js'
import { construirPoliticas } from '../policy/index.js'
import { LedgerDiario } from '../policy/ledger.js'
import { abrirSesion } from '../wdk/session.js'
import { correr } from '../run.js'

/**
 * API HTTP de Cerrojo: la misma tuberia, para una interfaz.
 *
 * Existe para que una app (movil o web) no tenga que reimplementar nada: consume
 * exactamente las mismas capas que el CLI y el servidor MCP. Y hereda la misma
 * propiedad: **no hay endpoint que ejecute en vivo**. Todo es dry-run.
 *
 * Escucha en 127.0.0.1 por defecto. Para probar desde un telefono en la misma red,
 * arranca con CERROJO_API_HOST=0.0.0.0 — y solo en una red de confianza.
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
    // CORS abierto: la API solo escucha en local y no expone ninguna escritura.
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
  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
  const sesion = await abrirSesion({ seed: leerSeed(), cfg, ledger, allowlist })

  try {
    const verdicto = await sesion.cuenta.simulate.transfer({
      token: cuerpo.token ?? cfg.token.address,
      recipient: String(cuerpo.destinatario ?? ''),
      amount: BigInt(cuerpo.monto_base ?? '0')
    })

    return {
      decision: verdicto.decision,
      politica: verdicto.policy_id,
      regla: verdicto.matched_rule,
      razon: verdicto.reason,
      monto: { base: String(cuerpo.monto_base ?? '0'), legible: formatearMonto(cuerpo.monto_base ?? '0', cfg.token.decimals) },
      traza: verdicto.trace
    }
  } finally {
    sesion.cerrar()
  }
}

async function correrNomina ({ cfg, cuerpo }) {
  const csv = cuerpo.csv
    ? (cuerpo.csv.includes(':') || cuerpo.csv.startsWith('/') ? cuerpo.csv : join(RAIZ, cuerpo.csv))
    : join(RAIZ, 'data', 'nomina_agosto.csv')

  const { recibo, markdown } = await correr({
    csv,
    instruccion: cuerpo.instruccion ?? 'paga la nomina',
    modo: 'dry-run', // no hay forma de pedir 'live' por HTTP. A proposito.
    planner: cuerpo.planner === 'llm' ? 'llm' : 'rules',
    conDemo: Boolean(cuerpo.demo),
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
