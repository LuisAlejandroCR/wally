import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import WDK from '@tetherto/wdk'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from '../config.js'
import { LedgerDiario } from '../policy/ledger.js'
import { abrirSesion } from '../wdk/session.js'
import { correr } from '../run.js'

/**
 * El eval: la unica forma de decir "funciona" con un numero al lado.
 *
 * Dos metricas, y la segunda manda:
 *   - tasa de aciertos, ponderada por peso;
 *   - **falsos permisos**: casos que debian denegarse y salieron permitidos.
 *     Ese numero tiene que ser 0. Se reporta aparte y en grande.
 */
export async function correrEval ({ cfg = cargarConfig(), corridas = 5, rutaCasos = join(RAIZ, 'evals', 'casos.json'), escribir = true } = {}) {
  const inicio = new Date()
  const golden = JSON.parse(readFileSync(rutaCasos, 'utf8'))
  const allowlist = cargarAllowlist(cfg.allowlistPath)

  // Si no hay seed configurada, el eval sigue: genera una en memoria. Las
  // politicas no dependen de que direccion firma.
  let seed
  try { seed = leerSeed() } catch { seed = WDK.getRandomSeedPhrase() }

  const direcciones = {
    ...golden.direcciones,
    en_lista_3_minusculas: golden.direcciones.en_lista_3.toLowerCase()
  }

  const resultados = []

  for (const caso of golden.casos) {
    const corridasDelCaso = []

    for (let i = 0; i < corridas; i++) {
      corridasDelCaso.push(
        caso.tipo === 'politica'
          ? await correrCasoPolitica({ caso, cfg, seed, allowlist, direcciones })
          : await correrCasoCorrida({ caso, cfg, seed })
      )
    }

    const aciertos = corridasDelCaso.filter((r) => r.acierto).length
    const falsosPermisos = corridasDelCaso.filter((r) => r.falsoPermiso).length

    resultados.push({
      id: caso.id,
      tipo: caso.tipo,
      descripcion: caso.descripcion,
      peso: caso.peso ?? 1,
      corridas,
      aciertos,
      estable: aciertos === corridas || aciertos === 0,
      falsosPermisos,
      detalle: corridasDelCaso[0]?.detalle ?? null
    })
  }

  const total = resultados.length
  const casosPerfectos = resultados.filter((r) => r.aciertos === corridas).length
  const pesoTotal = resultados.reduce((a, r) => a + r.peso, 0)
  const pesoAcertado = resultados.reduce((a, r) => a + (r.aciertos / corridas) * r.peso, 0)
  const falsosPermisos = resultados.reduce((a, r) => a + r.falsosPermisos, 0)

  const reporte = {
    generadoEn: inicio.toISOString(),
    corridasPorCaso: corridas,
    total,
    aciertos: casosPerfectos,
    tasa: total === 0 ? 0 : Number((casosPerfectos / total).toFixed(4)),
    tasaPonderada: pesoTotal === 0 ? 0 : Number((pesoAcertado / pesoTotal).toFixed(4)),
    falsosPermisos,
    conVarianza: resultados.filter((r) => !r.estable).map((r) => r.id),
    casos: resultados,
    entorno: { node: process.version, red: cfg.network, capTx: cfg.capTx.toString(), capDay: cfg.capDay.toString() }
  }

  reporte.texto = formatear(reporte)

  if (escribir) {
    const dir = join(cfg.dirRuns, `eval_${inicio.toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'eval.json'), JSON.stringify(reporte, null, 2))
    writeFileSync(join(dir, 'eval.md'), reporte.texto)
    reporte.dir = dir
  }

  return reporte
}

async function correrCasoPolitica ({ caso, cfg, seed, allowlist, direcciones }) {
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: `eval-${caso.id}`, persistir: false })
  if (caso.gastadoPrevio) ledger.gastado = BigInt(caso.gastadoPrevio)

  const sesion = await abrirSesion({ seed, cfg, ledger, allowlist })

  try {
    const args = materializar(caso.args, direcciones, cfg)
    const simulador = sesion.cuenta.simulate[caso.operacion]

    if (typeof simulador !== 'function') {
      return { acierto: false, falsoPermiso: false, detalle: `la operacion ${caso.operacion} no existe en esta cuenta` }
    }

    const verdicto = await simulador(args)
    const esperaDeny = caso.espera.decision === 'DENY'
    const decisionOk = verdicto.decision === caso.espera.decision
    const politicaOk = !caso.espera.policy_id || verdicto.policy_id === caso.espera.policy_id

    return {
      acierto: decisionOk && politicaOk,
      falsoPermiso: esperaDeny && verdicto.decision === 'ALLOW',
      detalle: `${verdicto.decision}${verdicto.policy_id ? ` por ${verdicto.policy_id}/${verdicto.matched_rule}` : ''} (${verdicto.reason})`
    }
  } catch (err) {
    return { acierto: false, falsoPermiso: false, detalle: `error: ${err.message}` }
  } finally {
    sesion.cerrar()
  }
}

async function correrCasoCorrida ({ caso, cfg, seed }) {
  const { recibo } = await correr({
    csv: join(RAIZ, caso.csv),
    instruccion: caso.instruccion,
    modo: 'dry-run',
    planner: 'rules',
    sinRed: true,
    escribir: false,
    estadoEfimero: true,
    gastadoPrevio: caso.gastadoPrevio ?? '0',
    cfg,
    seed
  })

  if (recibo.failure) {
    return { acierto: false, falsoPermiso: false, detalle: `corrida abortada: ${recibo.failure.code}` }
  }

  const fallos = []
  let falsoPermiso = false

  for (const [clave, valor] of Object.entries(caso.espera.totales ?? {})) {
    if (recibo.totals[clave] !== valor) fallos.push(`${clave}=${recibo.totals[clave]} (esperado ${valor})`)
  }

  if (!recibo.totals.cuadra) fallos.push('la suma no cuadra')

  for (const [fila, esperado] of Object.entries(caso.espera.filas ?? {})) {
    const linea = recibo.lines.find((l) => l.row === Number(fila))

    if (!linea) { fallos.push(`falta la fila ${fila}`); continue }

    if (linea.estado !== esperado.estado) {
      fallos.push(`fila ${fila}: ${linea.estado} (esperado ${esperado.estado})`)
      if (esperado.estado === 'denegada' && linea.estado === 'ejecutada') falsoPermiso = true
    }

    if (esperado.policy_id && linea.policy?.id !== esperado.policy_id) {
      fallos.push(`fila ${fila}: denegada por ${linea.policy?.id} (esperado ${esperado.policy_id})`)
    }
  }

  return {
    acierto: fallos.length === 0,
    falsoPermiso,
    detalle: fallos.length === 0
      ? `${recibo.totals.ejecutadas}/${recibo.totals.denegadas}/${recibo.totals.no_intentadas} ejecutadas/denegadas/no intentadas`
      : fallos.join(' · ')
  }
}

function materializar (args, direcciones, cfg) {
  const salida = { token: cfg.token.address }

  for (const [clave, valor] of Object.entries(args)) {
    if (typeof valor === 'string' && direcciones[valor]) { salida[clave] = direcciones[valor]; continue }
    if (clave === 'amount' || clave === 'value') { salida[clave] = BigInt(valor); continue }
    salida[clave] = valor
  }

  return salida
}

function formatear (r) {
  const L = []
  L.push('# Eval de Cerrojo')
  L.push('')
  L.push(`**${r.generadoEn}** · ${r.corridasPorCaso} corridas por caso · red \`${r.entorno.red}\` · Node ${r.entorno.node}`)
  L.push('')
  L.push('| Caso | Tipo | Peso | Aciertos | Detalle |')
  L.push('|---|---|---|---|---|')
  for (const c of r.casos) {
    const marca = c.aciertos === r.corridasPorCaso ? '✅' : (c.aciertos === 0 ? '❌' : '⚠️')
    L.push(`| \`${c.id}\` ${marca} | ${c.tipo} | ${c.peso} | ${c.aciertos}/${c.corridas} | ${String(c.detalle ?? '').slice(0, 110)} |`)
  }
  L.push('')
  L.push(`**Tasa:** ${r.aciertos}/${r.total} casos perfectos (${(r.tasa * 100).toFixed(1)}%) · **ponderada por peso:** ${(r.tasaPonderada * 100).toFixed(1)}%`)
  L.push('')
  L.push(r.falsosPermisos === 0
    ? '## FALSOS PERMISOS: 0 ✅\n\nNinguna operacion que debia denegarse se ejecuto.'
    : `## FALSOS PERMISOS: ${r.falsosPermisos} ❌\n\nEs el pecado capital de este proyecto. Nada mas importa hasta que vuelva a 0.`)
  L.push('')
  if (r.conVarianza.length) L.push(`**Casos con varianza entre corridas:** ${r.conVarianza.join(', ')}`)
  L.push('')
  return L.join('\n')
}
