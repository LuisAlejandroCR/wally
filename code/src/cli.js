#!/usr/bin/env node
// src/cli.js
//
// The command line, and the only surface in the project that can actually send —
// and only with `--live` and `--confirmo` given together. Every command here
// reads the same five layers the MCP server and the HTTP API read, and none of
// them re-decides anything the policy engine already decided.

import { join } from 'node:path'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from './config.js'
import { formatearMonto } from './ingest/amount.js'
import { LedgerDiario } from './policy/ledger.js'
import { construirPoliticas } from './policy/index.js'
import { abrirSesion } from './wdk/session.js'
import { ejecutarVale } from './execute/index.js'
import { Vales } from './vales.js'
import { correr } from './run.js'
import { correrEval } from './eval/run.js'
import { evalInyeccion } from './eval/inyeccion.js'
import { crearApi } from './api/server.js'
import { correrDemo } from './demo.js'
import { correrParidad, paridadMarkdown } from './paridad.js'
import { cliDisponible, errCliAusente } from './wdk/cli.js'

const AYUDA = `cerrojo — el agente propone, el cerrojo decide

  cerrojo run       arma un plan desde un CSV y lo pasa por las politicas
  cerrojo eval      corre el golden set de casos N veces y reporta falsos permisos
  cerrojo inyeccion mide el CSV envenenado contra el limpio, con el modelo real
  cerrojo policy    muestra las politicas activas, sin tocar la red
  cerrojo doctor    revisa la configuracion y el entorno
  cerrojo serve     levanta la API HTTP local (para una app movil o web)
  cerrojo paridad   corre la nomina y entrega solo lo aprobado a la CLI oficial de WDK
  cerrojo vales     lista los pagos que un agente propuso y esperan a una persona
  cerrojo aprobar   aprueba UN vale y lo ejecuta (dry-run salvo --live --confirmo)
  cerrojo rechazar  descarta un vale propuesto
  cerrojo demo      la demo completa en seis actos, para grabar el video
                    (--rapido: sin modelo, planner determinista · --sin-red: sin cadena)

Opciones de run:
  --csv <ruta>            CSV de nomina (por defecto: ./evals/fixtures/nomina_agosto.csv)
  --instruccion "<texto>" instruccion del operador
  --llm                   usa el planner con modelo (por defecto: reglas deterministas)
  --live --confirmo       ejecuta de verdad. Sin las dos banderas, siempre dry-run
  --sin-red               no consulta la cadena: solo plan y politicas
  --demo                  agrega el panel de mainnet en solo lectura
  --reset-dia             pone a cero el acumulado diario antes de correr
  --json                  imprime el recibo.json en vez del markdown

Opciones de vales:
  cerrojo vales [--todos] [--json]        pendientes; --todos incluye los cerrados
  cerrojo aprobar <id>                    revalida contra las politicas, dry-run
  cerrojo aprobar <id> --live --confirmo  ejecuta de verdad
  cerrojo rechazar <id> [--motivo "<t>"]  descarta sin ejecutar

Opciones de paridad:
  --demostrar-fuga        entrega ademas UNA linea denegada a la CLI, en dry-run,
                          para ver que la CLI sola no tiene tope ni allowlist
  --json                  imprime el reporte de paridad en JSON

Opciones de eval:
  --runs <n>              corridas por caso (por defecto: CERROJO_EVAL_RUNS o 5)
  --json                  imprime el reporte en JSON
`

const args = process.argv.slice(2)
const comando = args[0] ?? 'ayuda'

const bandera = (nombre) => args.includes(`--${nombre}`)
const valor = (nombre, porDefecto = null) => {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : porDefecto
}

const cfg = cargarConfig()

try {
  switch (comando) {
    case 'run': await cmdRun(); break
    case 'eval': await cmdEval(); break
    case 'inyeccion': await cmdInyeccion(); break
    case 'policy': await cmdPolicy(); break
    case 'doctor': await cmdDoctor(); break
    case 'serve': await cmdServe(); break
    case 'paridad': await cmdParidad(); break
    case 'vales': await cmdVales(); break
    case 'aprobar': await cmdAprobar(); break
    case 'rechazar': await cmdRechazar(); break
    case 'demo': await correrDemo({ cfg, sinRed: bandera('sin-red'), rapido: bandera('rapido') }); break
    default: console.log(AYUDA)
  }
} catch (err) {
  // A typed error with its fix, never a stack trace in front of a user.
  if (err?.code && err?.suggestion) {
    console.error(`\n⛔ ${err.code}: ${err.message}\n   ➜ ${err.suggestion}\n`)
    process.exit(1)
  }
  console.error(`\n⛔ Error inesperado: ${err?.message ?? err}\n`)
  process.exit(1)
}

async function cmdRun () {
  const enVivo = bandera('live') && bandera('confirmo')

  if (bandera('live') && !bandera('confirmo')) {
    console.error('\n⛔ --live exige tambien --confirmo. Sin las dos, la corrida es dry-run.\n')
    process.exit(1)
  }

  const { recibo, markdown, dir } = await correr({
    csv: valor('csv', cfg.csvPorDefecto),
    instruccion: valor('instruccion', 'paga la nomina de agosto'),
    modo: enVivo ? 'live' : 'dry-run',
    planner: bandera('llm') ? 'llm' : 'rules',
    sinRed: bandera('sin-red'),
    conDemo: bandera('demo'),
    resetDia: bandera('reset-dia'),
    cfg
  })

  if (bandera('json')) {
    console.log(JSON.stringify(recibo, null, 2))
  } else {
    console.log(`\n${markdown}`)
    if (dir) console.log(`\nRecibo escrito en ${dir}\n`)
  }

  // A receipt that does not balance, or an aborted run, does not exit 0.
  process.exit(recibo.failure || !recibo.totals.cuadra ? 1 : 0)
}

async function cmdParidad () {
  if (!cliDisponible()) throw errCliAusente()

  // The same run as always. Parity re-decides nothing: it reads the receipt.
  const { recibo, tesoreria } = await correr({
    csv: valor('csv', cfg.csvPorDefecto),
    instruccion: valor('instruccion', 'paga la nomina de agosto'),
    modo: 'dry-run',
    planner: bandera('llm') ? 'llm' : 'rules',
    resetDia: !bandera('sin-reset'),
    escribir: false,
    cfg
  })

  const paridad = await correrParidad({
    cfg,
    recibo,
    direccionSdk: tesoreria,
    demostrarFuga: bandera('demostrar-fuga')
  })

  if (bandera('json')) {
    console.log(JSON.stringify(paridad, null, 2))
  } else {
    console.log(`\n${paridadMarkdown(paridad)}`)
  }

  process.exit(paridad.cuadra ? 0 : 1)
}

async function cmdEval () {
  const reporte = await correrEval({ cfg, corridas: Number(valor('runs', cfg.evalRuns)) })

  if (bandera('json')) {
    console.log(JSON.stringify(reporte, null, 2))
  } else {
    console.log(reporte.texto)
  }

  process.exit(reporte.falsosPermisos > 0 || reporte.aciertos < reporte.total ? 1 : 0)
}

async function cmdServe () {
  const puerto = Number(valor('puerto', process.env.CERROJO_API_PORT ?? '8787'))
  const host = valor('host', process.env.CERROJO_API_HOST ?? '127.0.0.1')

  crearApi({ cfg }).listen(puerto, host, () => {
    console.log(`\ncerrojo API en http://${host}:${puerto}`)
    console.log('  GET  /salud          estado del servicio')
    console.log('  GET  /politicas      topes, allowlist y reglas activas')
    console.log('  GET  /estado-diario  acumulado del dia contra el tope')
    console.log('  POST /simular        { destinatario, monto_base } -> ALLOW | DENY con regla y razon')
    console.log('  POST /correr         { csv?, instruccion? } -> recibo completo')
    console.log('  GET  /corridas/:id   recibo de una corrida anterior')
    console.log('\n  Ningun endpoint envia fondos: la API es dry-run por construccion.\n')
  })
}

async function cmdInyeccion () {
  const reporte = await evalInyeccion({
    cfg,
    corridas: Number(valor('runs', '3')),
    planner: bandera('rapido') ? 'rules' : 'llm'
  })

  console.log(bandera('json') ? JSON.stringify(reporte, null, 2) : reporte.texto)
  if (reporte.dir) console.log(`Reporte en ${reporte.dir}
`)

  process.exit(reporte.derivasPeligrosas > 0 || reporte.pagosAlAtacante > 0 ? 1 : 0)
}

async function cmdPolicy () {
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

  console.log(`\nPoliticas activas en ${cfg.network} (token ${cfg.token.symbol}, ${cfg.token.decimals} decimales)\n`)
  for (const p of politicas) {
    console.log(`  ${p.id}  [${p.scope}]  ${p.name}`)
    for (const r of p.rules) {
      console.log(`      ${r.action === 'DENY' ? '⛔' : '✅'} ${r.name} · ${Array.isArray(r.operation) ? r.operation.join(',') : r.operation}${r.reason ? `\n         razon: ${r.reason}` : ''}`)
    }
  }
  console.log(`\n  Destinatarios permitidos: ${allowlist.length}`)
  console.log(`  Acumulado de hoy: ${formatearMonto(ledger.gastado, cfg.token.decimals)} / ${formatearMonto(cfg.capDay, cfg.token.decimals)} ${cfg.token.symbol}`)
  console.log('\n  Toda operacion de escritura que no sea `transfer` esta denegada por defecto (default-deny del motor de WDK).\n')
}

/* ── Vouchers: the human step between an agent's proposal and a signature ────
 *
 * Approving exists here and only here. The MCP server can create a voucher; it
 * has no tool that approves one. That is why this command is typed by a person,
 * and why the policy engine gets the last word again on the way through.
 */

function abrirVales () {
  return new Vales({ dir: cfg.dirEstado })
}

function montoDeVale (v) {
  return `${formatearMonto(BigInt(v.orden.amount), cfg.token.decimals)} ${cfg.token.symbol}`
}

async function cmdVales () {
  const vales = abrirVales()
  const lista = bandera('todos') ? vales.listar() : vales.pendientes()

  if (bandera('json')) {
    console.log(JSON.stringify(lista, null, 2))
    return
  }

  if (lista.length === 0) {
    console.log(`\n  No hay vales ${bandera('todos') ? '' : 'pendientes '}en ${join(cfg.dirEstado, 'vales')}\n`)
    return
  }

  console.log(`\n  ${lista.length} vale(s) · ${cfg.network} · aprobar es un acto humano, no una herramienta del agente\n`)
  for (const v of lista) {
    console.log(`  ${v.id}`)
    console.log(`      ${v.estado.toUpperCase().padEnd(10)} ${montoDeVale(v).padStart(14)}  →  ${v.orden.recipient}`)
    if (v.motivo) console.log(`      motivo: ${v.motivo}`)
    console.log(`      expira: ${v.expira}`)
    if (v.resuelto?.policy) console.log(`      denegado al aprobar: ${v.resuelto.policy.rule} · ${v.resuelto.policy.reason}`)
    console.log('')
  }
  console.log(`  Para aprobar uno:  node src/cli.js aprobar <id>\n`)
}

async function cmdAprobar () {
  const id = args[1]
  if (!id || id.startsWith('--')) {
    console.error('\n⛔ Falta el id del vale.  Uso: cerrojo aprobar <id> [--live --confirmo]\n')
    process.exit(1)
  }

  const enVivo = bandera('live') && bandera('confirmo')
  if (bandera('live') && !bandera('confirmo')) {
    console.error('\n⛔ --live exige tambien --confirmo. Sin las dos, la aprobacion se ejecuta en dry-run.\n')
    process.exit(1)
  }

  const vales = abrirVales()
  const previo = vales.leer(id)
  if (!previo) {
    console.error(`\n⛔ No existe el vale ${id}. Mira los pendientes con: cerrojo vales\n`)
    process.exit(1)
  }

  console.log(`\n  Vale       ${previo.id}`)
  console.log(`  Pago       ${montoDeVale(previo)}  →  ${previo.orden.recipient}`)
  if (previo.motivo) console.log(`  Motivo     ${previo.motivo}`)
  console.log(`  Modo       ${enVivo ? 'LIVE — se firma y se envia' : 'dry-run'}`)

  try {
    vales.aprobar(id)
  } catch (err) {
    console.error(`\n⛔ ${err.message}\n`)
    process.exit(1)
  }

  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
  const sesion = await abrirSesion({ seed: leerSeed(), cfg, ledger, allowlist })

  try {
    const r = await ejecutarVale({ sesion, cfg, ledger, vales, id, modo: enVivo ? 'live' : 'dry-run' })

    // This is the verdict that counts, not the one the voucher arrived with.
    console.log(`  Revalidado ${r.revalidacion ?? '—'}  (la politica decide otra vez, ahora)\n`)

    if (!r.ok) {
      console.error(`  ⛔ No se ejecuto: ${r.razon}`)
      if (r.vale?.resuelto?.policy) {
        console.error(`     politica ${r.vale.resuelto.policy.id} · regla ${r.vale.resuelto.policy.rule}`)
      }
      console.error('')
      process.exit(1)
    }

    const v = r.vale
    console.log(`  ✅ ${v.estado} en modo ${v.resuelto.modo}`)
    if (v.resuelto.txHash) console.log(`     tx ${v.resuelto.txHash}`)
    if (v.resuelto.feeEstimada) console.log(`     comision ${v.resuelto.feeEstimada} wei${v.resuelto.quoteExacto ? '' : ' (estimada)'}`)
    console.log(`     acumulado del dia: ${formatearMonto(ledger.gastado, cfg.token.decimals)} / ${formatearMonto(cfg.capDay, cfg.token.decimals)} ${cfg.token.symbol}\n`)
  } finally {
    sesion.cerrar()
  }
}

async function cmdRechazar () {
  const id = args[1]
  if (!id || id.startsWith('--')) {
    console.error('\n⛔ Falta el id del vale.  Uso: cerrojo rechazar <id> [--motivo "<texto>"]\n')
    process.exit(1)
  }

  try {
    const v = abrirVales().rechazar(id, { motivo: valor('motivo', null) })
    console.log(`\n  ${v.id} rechazado. No se ejecuto nada.\n`)
  } catch (err) {
    console.error(`\n⛔ ${err.message}\n`)
    process.exit(1)
  }
}

async function cmdDoctor () {
  const lineas = []
  const ok = (b) => (b ? '✅' : '❌')

  lineas.push(`  Node                ${process.version}`)
  lineas.push(`  Red de ejecucion    ${cfg.network} · ${cfg.rpcUrl}`)
  lineas.push(`  Token               ${cfg.token.symbol} ${cfg.token.address} (${cfg.token.decimals} dec)`)
  lineas.push(`  Tope por transfer   ${formatearMonto(cfg.capTx, cfg.token.decimals)} ${cfg.token.symbol}`)
  lineas.push(`  Tope diario         ${formatearMonto(cfg.capDay, cfg.token.decimals)} ${cfg.token.symbol}`)
  lineas.push(`  Mainnet de demo     ${cfg.demo.network} · solo lectura: ${ok(cfg.demo.readOnly)}`)
  lineas.push(`  Planner             ${cfg.planner.modo} · modelo ${cfg.planner.modelo} · ANTHROPIC_API_KEY ${ok(Boolean(cfg.planner.apiKey))}`)

  let allowlist = []
  try {
    allowlist = cargarAllowlist(cfg.allowlistPath)
    lineas.push(`  Allowlist           ✅ ${allowlist.length} direcciones · ${cfg.allowlistPath}`)
  } catch (err) {
    lineas.push(`  Allowlist           ❌ ${err.message}`)
  }

  let seed = null
  try {
    seed = leerSeed()
    lineas.push(`  Seed                ✅ presente (${seed.split(/\s+/).length} palabras). No se imprime nunca.`)
  } catch {
    lineas.push('  Seed                ❌ falta CERROJO_SEED en code/.env')
  }

  if (seed && allowlist.length) {
    const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
    const sesion = await abrirSesion({ seed, cfg, ledger, allowlist })
    lineas.push(`  Tesoreria           ${sesion.tesoreria}`)
    lineas.push(`  Cuenta gobernada    ${ok(typeof sesion.cuenta.simulate?.transfer === 'function')} (Proxy de politicas activo)`)

    try {
      const saldo = await sesion.cuenta.getBalance()
      lineas.push(`  Saldo nativo        ${saldo} wei`)
    } catch (err) {
      lineas.push(`  Saldo nativo        ⚠️ sin respuesta del RPC (${err.message.split('\n')[0].slice(0, 60)})`)
    }

    lineas.push(`  Acumulado de hoy    ${formatearMonto(ledger.gastado, cfg.token.decimals)} ${cfg.token.symbol}`)
    sesion.cerrar()
  }

  console.log(`\ncerrojo doctor\n\n${lineas.join('\n')}\n`)
}
