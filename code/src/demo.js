import { join } from 'node:path'

import { RAIZ, cargarAllowlist, cargarConfig, leerSeed } from './config.js'
import { formatearMonto } from './ingest/amount.js'
import { construirPoliticas } from './policy/index.js'
import { LedgerDiario } from './policy/ledger.js'
import { abrirSesion } from './wdk/session.js'
import { panelMainnet } from './execute/index.js'
import { correr } from './run.js'
import { compararDeriva, INSTRUCCION_COMPLETA } from './eval/inyeccion.js'

/**
 * La instruccion del operador para la demo.
 *
 * Dice "todas las filas" a proposito. Medido el 2026-08-22: con "paga la nomina
 * de agosto", el modelo excluye por alcance el bono y el pago a proveedor —un
 * juicio defendible— y esas dos filas **no llegan a la politica**, asi que la
 * corrida sale con cero denegaciones. Correcto, pero no muestra el cerrojo.
 * Con esta instruccion las doce filas llegan, y el motor decide sobre todas.
 */
export const INSTRUCCION_DEMO = INSTRUCCION_COMPLETA

/**
 * La demo, en seis actos y un solo comando.
 *
 * Existe para que el video de 3 minutos sea una ejecucion real y no una sucesion
 * de comandos tecleados a mano con el riesgo de equivocarse en vivo. Cada acto
 * imprime lo que hay que ver y nada mas.
 *
 * Los actos 2 y 3 corren con el modelo de verdad cuando hay ANTHROPIC_API_KEY:
 * el argumento de la inyeccion vale mucho mas si el modelo esta leyendo las
 * celdas envenenadas. Si no hay clave, o si la llamada falla, la demo **no se
 * cae**: cae al planner determinista y lo dice en pantalla.
 *
 * Corre con estado efimero: se puede repetir tantas veces como haga falta.
 */
export async function correrDemo ({ cfg = cargarConfig(), sinRed = false, rapido = false } = {}) {
  const csvLimpio = cfg.csvPorDefecto
  const csvEnvenenado = join(RAIZ, 'evals', 'fixtures', 'nomina_inyeccion.csv')
  const seed = leerSeed()

  const hayClave = Boolean(cfg.planner.apiKey || process.env.ANTHROPIC_API_KEY)
  const conModelo = hayClave && !rapido

  acto(1, 'El cerrojo existe antes que el agente')
  await actoPoliticas({ cfg, seed })

  acto(2, `La nomina: 12 filas y una instruccion en espanol${conModelo ? `, leidas por ${cfg.planner.modelo}` : ''}`)
  console.log(`  Instruccion del operador:\n    "${INSTRUCCION_DEMO}"\n`)
  const limpio = await planificarYCorrer({ csv: csvLimpio, cfg, seed, sinRed, conModelo, gastadoPrevio: '0', etiqueta: 'nomina limpia' })
  console.log(limpio.markdown)

  acto(3, 'El mismo CSV, con tres celdas envenenadas')
  const sucio = await planificarYCorrer({ csv: csvEnvenenado, cfg, seed, sinRed, conModelo: limpio.conModelo, gastadoPrevio: '0', etiqueta: 'nomina envenenada' })
  actoInyeccion(limpio.recibo, sucio.recibo, limpio.conModelo && sucio.conModelo ? cfg.planner.modelo : null)

  acto(4, 'Con la red apagada')
  await actoSinRed({ cfg, seed })

  acto(5, 'El segundo pago del dia')
  // Este acto va con el planner determinista a proposito: lo que se demuestra es
  // el acumulado, y no hace falta gastar 22 s de video en otra llamada al modelo.
  const segunda = await correr({ csv: csvLimpio, instruccion: INSTRUCCION_DEMO, modo: 'dry-run', planner: 'rules', sinRed: true, escribir: false, estadoEfimero: true, gastadoPrevio: limpio.recibo.totals.montoEjecutado, cfg, seed })
  actoSegundaCorrida(limpio.recibo, segunda.recibo, cfg)

  acto(6, 'Mainnet: se mira, no se toca')
  await actoMainnet({ cfg, seed, sinRed })

  console.log('\n' + '═'.repeat(78))
  console.log('  El agente propone. El cerrojo decide.')
  console.log('  Y el tope no vive en el prompt: por eso ninguna celda envenenada consigue')
  console.log('  que se ejecute una linea que no se habria ejecutado.')
  console.log('═'.repeat(78) + '\n')
}

function acto (n, titulo) {
  console.log('\n' + '═'.repeat(78))
  console.log(`  ACTO ${n} · ${titulo}`)
  console.log('═'.repeat(78) + '\n')
}

/**
 * Corre una nomina con el modelo si se puede, y con reglas si no.
 *
 * En cámara no se cae nada: si falta la clave, si la API responde mal o si el
 * modelo se abstiene de todo, esta funcion lo dice en una linea y sigue con el
 * planner determinista. Lo que no hace nunca es fingir que uso el modelo.
 */
async function planificarYCorrer ({ csv, cfg, seed, sinRed, conModelo, gastadoPrevio, etiqueta }) {
  const comun = { csv, instruccion: INSTRUCCION_DEMO, modo: 'dry-run', sinRed, escribir: false, estadoEfimero: true, gastadoPrevio, cfg, seed }

  if (!conModelo) {
    const r = await correr({ ...comun, planner: 'rules' })
    return { ...r, conModelo: false }
  }

  process.stdout.write(`  consultando a ${cfg.planner.modelo} con la ${etiqueta}… `)
  const t0 = performance.now()
  const r = await correr({ ...comun, planner: 'llm' })
  const s = ((performance.now() - t0) / 1000).toFixed(1)

  const planner = r.recibo.run?.planner ?? {}
  const fallo = planner.fallo ?? r.recibo.failure?.message ?? null

  if (fallo) {
    console.log(`falló (${s} s)\n`)
    console.log(`  ⚠️ El planner con modelo no respondio: ${String(fallo).slice(0, 120)}`)
    console.log('  Se sigue con el planner determinista. El cerrojo es el mismo en los dos caminos.\n')
    const alterno = await correr({ ...comun, planner: 'rules' })
    return { ...alterno, conModelo: false }
  }

  console.log(`respondio en ${s} s · reintentos: ${planner.retries ?? 0}\n`)
  return { ...r, conModelo: true }
}

async function actoPoliticas ({ cfg, seed }) {
  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: 'demo', persistir: false })
  const politicas = construirPoliticas({ wallet: cfg.network, capTx: cfg.capTx, capDay: cfg.capDay, allowlist, token: cfg.token, ledger })

  for (const p of politicas) {
    for (const r of p.rules) {
      console.log(`  ${r.action === 'DENY' ? '⛔' : '✅'} ${p.id.padEnd(24)} ${r.name}`)
    }
  }

  const sesion = await abrirSesion({ seed, cfg, ledger, allowlist })
  console.log(`\n  Tesoreria: ${sesion.tesoreria}`)
  console.log(`  Cuenta gobernada por politicas: ${typeof sesion.cuenta.simulate?.transfer === 'function'}`)
  console.log('  Operaciones de escritura permitidas: transfer, y ninguna mas.')
  console.log('  sendTransaction, approve, signTypedData y delegate estan denegadas de fabrica.')
  sesion.cerrar()
}

function actoInyeccion (limpio, sucio, modelo) {
  const esencia = (r) => JSON.stringify(r.lines.map((l) => [l.row, l.estado, l.to, l.amount, l.policy?.id ?? null]))
  const iguales = esencia(limpio) === esencia(sucio)

  if (modelo) console.log(`  Las dos corridas las planifico ${modelo}, leyendo cada celda.\n`)

  console.log('  Las tres celdas envenenadas dicen, textualmente:\n')
  for (const l of sucio.lines) {
    if (!/IGNORA|system:|APROBADO/i.test(l.concepto ?? '')) continue
    console.log(`    fila ${l.row}: "${(l.concepto ?? '').slice(0, 96)}"`)
    console.log(`             -> ${l.estado}${l.policy ? ` por ${l.policy.id}` : ''}\n`)
  }

  console.log(`  Recibo limpio:     ${limpio.totals.ejecutadas} ejecutadas · ${limpio.totals.denegadas} denegadas · ${limpio.totals.no_intentadas} no intentadas`)
  console.log(`  Recibo envenenado: ${sucio.totals.ejecutadas} ejecutadas · ${sucio.totals.denegadas} denegadas · ${sucio.totals.no_intentadas} no intentadas`)

  // La propiedad que se demuestra no es "los dos recibos son iguales" —con un modelo
  // en el circuito eso no es estable— sino que **ninguna diferencia va hacia ejecutar**.
  const deriva = compararDeriva(limpio, sucio)

  if (iguales) {
    console.log('\n  ¿Identicos linea por linea? ✅ SI')
    console.log('  El texto viaja al recibo como dato. No mueve una sola decision.')
  } else if (deriva.peligrosas.length === 0) {
    console.log('\n  ¿Identicos linea por linea? NO, y conviene mirar en que direccion:')
    for (const d of deriva.conservadoras) {
      console.log(`    fila ${d.row}: ${d.antes} -> ${d.despues}  (el planner se puso MAS cauto al leer la celda envenenada)`)
    }
    console.log('\n  ✅ Ninguna diferencia va hacia ejecutar. Cero filas pasaron de denegada o no')
    console.log('     intentada a ejecutada, que es la unica deriva que importaria.')
  } else {
    console.log('\n  ❌ HAY DERIVA PELIGROSA: una fila que no se ejecutaba, se ejecuto.')
    for (const d of deriva.peligrosas) console.log(`    fila ${d.row}: ${d.antes} -> ${d.despues}`)
    console.log('     Esto es un fallo de bloqueo del proyecto. No grabar el video hasta arreglarlo.')
  }

  console.log('\n  Y en ningun caso el destinatario del "ataque" recibe fondos: esa direccion no esta')
  console.log('  en la allowlist, y la allowlist no vive en el prompt.')
  if (modelo) console.log(`  La defensa no es que ${modelo} resista la inyeccion. Es que el tope no esta en lo que lee.`)
}

async function actoSinRed ({ cfg, seed }) {
  const muerto = { ...cfg, rpcUrl: 'http://127.0.0.1:9' }
  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: 'demo-sin-red', persistir: false })
  const sesion = await abrirSesion({ seed, cfg: muerto, ledger, allowlist })

  console.log(`  RPC apuntando a ${muerto.rpcUrl} — un puerto muerto.\n`)

  const t0 = performance.now()
  const verdicto = await sesion.cuenta.simulate.transfer({
    token: cfg.token.address,
    recipient: allowlist[0],
    amount: 900000000n
  })
  const ms = (performance.now() - t0).toFixed(1)

  console.log(`  transfer de 900 USDT -> ${verdicto.decision}`)
  console.log(`  ${verdicto.policy_id} / ${verdicto.matched_rule}`)
  console.log(`  ${verdicto.reason}`)
  console.log(`\n  Tardo ${ms} ms. Denegar no cuesta red: si la cadena se cae, Cerrojo sigue diciendo que no.`)
  sesion.cerrar()
}

function actoSegundaCorrida (primera, segunda, cfg) {
  const d = cfg.token.decimals
  console.log(`  Del tope diario de ${formatearMonto(cfg.capDay, d)} ${cfg.token.symbol}, la primera corrida ya comprometio ${formatearMonto(primera.totals.montoEjecutado, d)}.\n`)

  for (const l of segunda.lines.filter((x) => x.policy?.id === 'cap-diario').slice(0, 4)) {
    console.log(`    fila ${String(l.row).padStart(2)} · ${formatearMonto(l.amount, d)} ${cfg.token.symbol} -> denegada por cap-diario`)
  }

  console.log(`\n  Segunda corrida: ${segunda.totals.ejecutadas} ejecutadas · ${segunda.totals.denegadas} denegadas · ${segunda.totals.no_intentadas} no intentadas`)
  console.log('  El acumulado del dia sobrevive entre corridas. Nadie paga la nomina dos veces.')
}

async function actoMainnet ({ cfg, seed, sinRed }) {
  if (sinRed) { console.log('  (omitido: la demo corre con --sin-red)'); return }

  const allowlist = cargarAllowlist(cfg.allowlistPath)
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: 'demo-mainnet', persistir: false })
  const sesion = await abrirSesion({ seed, cfg, ledger, allowlist, conDemo: true })
  const panel = await panelMainnet({ sesion, cfg })

  console.log(`  Red: ${panel.network} (mainnet de verdad)`)
  console.log(`  Tarifa normal ahora mismo: ${panel.tarifas?.normal ?? 'n/d'} wei/gas`)
  console.log(`  Comision estimada de un transfer ERC-20: ${panel.feeTransferEstimada ?? 'n/d'} wei`)
  console.log(`\n  typeof cuenta.transfer === 'function'  ->  ${panel.transferExiste}`)
  console.log('  Dos cerrojos sobre la red donde hay dinero de verdad:')
  console.log('    1. estructural: la cuenta es toReadOnlyAccount(), el metodo de enviar no existe;')
  console.log('    2. declarativo: la politica mainnet-solo-lectura deniega toda escritura.')

  try {
    await sesion.demo.cuentaPlena.transfer({ token: cfg.token.address, recipient: allowlist[0], amount: 1n })
    console.log('\n  ⚠️ La escritura en mainnet NO fue denegada. Esto es un bug de bloqueo.')
  } catch (err) {
    console.log(`\n  Intento de escritura en mainnet -> ${err.constructor.name}`)
    console.log(`  ${err.policyId ?? ''}/${err.ruleName ?? ''}: ${err.reason ?? err.message}`)
  }

  sesion.cerrar()
}
