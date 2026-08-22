import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cargarAllowlist, cargarConfig, leerSeed } from './config.js'
import { leerNomina } from './ingest/csv.js'
import { armarPlan } from './plan/index.js'
import { LedgerDiario } from './policy/ledger.js'
import { abrirSesion } from './wdk/session.js'
import { ejecutarPlan, panelMainnet } from './execute/index.js'
import { construirRecibo, reciboDeFallo } from './receipt/build.js'
import { reciboMarkdown } from './receipt/markdown.js'

export function nuevoRunId (d = new Date()) {
  return `run_${d.toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z`
}

/**
 * Una corrida completa: ingest -> plan -> policy -> execute -> receipt.
 *
 * Pase lo que pase, sale un recibo. Si la corrida se cae, sale un recibo de fallo
 * con el codigo de error, su arreglo sugerido, y la suma cuadrando igual.
 */
export async function correr ({
  csv,
  instruccion = 'paga la nomina',
  modo = 'dry-run',
  planner = 'rules',
  sinRed = false,
  conDemo = false,
  resetDia = false,
  periodo = null,
  escribir = true,
  estadoEfimero = false,
  gastadoPrevio = null,
  cfg = cargarConfig(),
  seed = null
} = {}) {
  const runId = nuevoRunId()
  const startedAt = new Date().toISOString()

  let entrada = null
  let sesion = null

  try {
    const allowlist = cargarAllowlist(cfg.allowlistPath)
    const nomina = leerNomina(csv, { token: cfg.token })
    entrada = { ruta: csv, sha256: nomina.sha256 }

    const { plan, planner: metaPlanner } = await armarPlan({ instruccion, nomina, cfg, periodo, modo: planner })

    const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network, persistir: !estadoEfimero })
    if (resetDia) ledger.reset()
    if (gastadoPrevio !== null) ledger.gastado = BigInt(gastadoPrevio)

    sesion = await abrirSesion({ seed: seed ?? leerSeed(), cfg, ledger, allowlist, conDemo })

    const resultados = await ejecutarPlan({ sesion, plan, cfg, ledger, runId, modo, sinRed })
    const panel = conDemo ? await panelMainnet({ sesion, cfg }) : null

    const recibo = construirRecibo({
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      modo,
      cfg,
      instruccion,
      entrada,
      planner: metaPlanner,
      plan,
      resultados,
      politicas: sesion.politicas,
      allowlist,
      ledger,
      panelMainnet: panel
    })

    // La suma que no cuadra es un bug de bloqueo: el recibo se degrada a fallo.
    if (!recibo.totals.cuadra) {
      const fallo = reciboDeFallo({
        runId,
        startedAt,
        modo,
        cfg,
        instruccion,
        entrada,
        totalLineas: recibo.totals.lineas,
        error: {
          toJSON: () => ({
            code: 'E_TOTALS_MISMATCH',
            message: `La suma no cuadra: ${recibo.totals.ejecutadas}+${recibo.totals.denegadas}+${recibo.totals.no_intentadas} != ${recibo.totals.lineas}`,
            suggestion: 'Es un bug de bloqueo. No uses este recibo: reporta la corrida completa.',
            stage: 'receipt'
          })
        }
      })
      return finalizar({ recibo: fallo, cfg, runId, escribir, tesoreria: sesion.tesoreria })
    }

    return finalizar({ recibo, cfg, runId, escribir, tesoreria: sesion.tesoreria })
  } catch (err) {
    const recibo = reciboDeFallo({
      runId,
      startedAt,
      modo,
      cfg,
      error: err,
      instruccion,
      entrada,
      totalLineas: 0
    })
    return finalizar({ recibo, cfg, runId, escribir, tesoreria: null })
  } finally {
    sesion?.cerrar()
  }
}

function finalizar ({ recibo, cfg, runId, escribir, tesoreria }) {
  const md = reciboMarkdown(recibo)
  let dir = null

  if (escribir) {
    dir = join(cfg.dirRuns, runId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'recibo.json'), JSON.stringify(recibo, null, 2))
    writeFileSync(join(dir, 'recibo.md'), md)
  }

  return { recibo, markdown: md, dir, tesoreria }
}
