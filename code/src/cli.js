#!/usr/bin/env node
import { join } from 'node:path'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from './config.js'
import { formatearMonto } from './ingest/amount.js'
import { LedgerDiario } from './policy/ledger.js'
import { construirPoliticas } from './policy/index.js'
import { abrirSesion } from './wdk/session.js'
import { correr } from './run.js'
import { correrEval } from './eval/run.js'
import { crearApi } from './api/server.js'

const AYUDA = `cerrojo — el agente propone, el cerrojo decide

  cerrojo run       arma un plan desde un CSV y lo pasa por las politicas
  cerrojo eval      corre el golden set de casos N veces y reporta falsos permisos
  cerrojo policy    muestra las politicas activas, sin tocar la red
  cerrojo doctor    revisa la configuracion y el entorno
  cerrojo serve     levanta la API HTTP local (para una app movil o web)

Opciones de run:
  --csv <ruta>            CSV de nomina (por defecto: ./data/nomina_agosto.csv)
  --instruccion "<texto>" instruccion del operador
  --llm                   usa el planner con modelo (por defecto: reglas deterministas)
  --live --confirmo       ejecuta de verdad. Sin las dos banderas, siempre dry-run
  --sin-red               no consulta la cadena: solo plan y politicas
  --demo                  agrega el panel de mainnet en solo lectura
  --reset-dia             pone a cero el acumulado diario antes de correr
  --json                  imprime el recibo.json en vez del markdown

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
    case 'policy': await cmdPolicy(); break
    case 'doctor': await cmdDoctor(); break
    case 'serve': await cmdServe(); break
    default: console.log(AYUDA)
  }
} catch (err) {
  // Error tipado con su arreglo, nunca una traza en la cara del usuario.
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
    csv: valor('csv', join(RAIZ, 'data', 'nomina_agosto.csv')),
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

  // Un recibo que no cuadra, o una corrida abortada, no salen con codigo 0.
  process.exit(recibo.failure || !recibo.totals.cuadra ? 1 : 0)
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
