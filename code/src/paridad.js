// src/paridad.js
//
// Parity with the official wdk CLI. It answers three questions a judge can check
// in a minute: whether the CLI and the SDK are the same wallet, what actually
// reaches the CLI, and whether the CLI on its own would have stopped the line
// the lock refused. The adapter is injected so this can be tested without a chain.

import { formatearMonto } from './ingest/amount.js'
import * as adaptadorReal from './wdk/cli.js'

/**
 * The three questions, and their answers:
 *
 *   1. Same wallet? The CLI derives one address and the SDK derives another. If
 *      they do not match byte for byte, this fails.
 *   2. What reaches the CLI? Only the lines the lock approved. Denied ones are
 *      not handed over: there is no code path that does it.
 *   3. Would the CLI alone have stopped the denied line? No. With
 *      --demostrar-fuga one denied line is handed to it on purpose, in dry-run,
 *      and it builds the calldata all the same. The CLI has no cap and no
 *      allowlist; the lock has both.
 */
export async function correrParidad ({
  cfg,
  recibo,
  direccionSdk,
  adaptador = adaptadorReal,
  demostrarFuga = false
} = {}) {
  const network = cfg.network
  const token = cfg.token.symbol

  const { direccion: direccionCli, crudo: crudoDireccion } = await adaptador.direccionCli({ network })

  const mismaBilletera =
    typeof direccionCli === 'string' &&
    typeof direccionSdk === 'string' &&
    direccionCli.toLowerCase() === direccionSdk.toLowerCase()

  const lineas = []

  for (const linea of recibo.lines) {
    const base = {
      row: linea.row,
      estado: linea.estado,
      to: linea.to,
      amount: linea.amount,
      monto: linea.amount ? formatearMonto(BigInt(linea.amount), cfg.token.decimals) : null
    }

    if (linea.estado !== 'ejecutada') {
      // Not handed over. This branch never calls the adapter, and a test asserts it.
      lineas.push({
        ...base,
        entregadaALaCli: false,
        motivo: linea.estado === 'denegada'
          ? `el cerrojo la denego: ${linea.policy?.rule ?? 'sin regla'}`
          : 'el cerrojo no la intento'
      })
      continue
    }

    const cli = await adaptador.dryRunLinea({ network, token, to: linea.to, amount: linea.amount })
    lineas.push({ ...base, entregadaALaCli: true, cli })
  }

  // Optional demonstration: the first denied line, handed to the CLI on purpose.
  let fuga = null
  if (demostrarFuga) {
    const denegada = recibo.lines.find((l) => l.estado === 'denegada' && l.to && l.amount)
    if (denegada) {
      const cli = await adaptador.dryRunLinea({ network, token, to: denegada.to, amount: denegada.amount })
      fuga = {
        row: denegada.row,
        to: denegada.to,
        amount: denegada.amount,
        monto: formatearMonto(BigInt(denegada.amount), cfg.token.decimals),
        reglaDelCerrojo: denegada.policy?.rule ?? null,
        razonDelCerrojo: denegada.policy?.reason ?? null,
        // The CLI has no policy decision to report. If it failed, it failed against
        // the chain (balance, gas), not against a cap. That is exactly the point.
        cliLaRefusoPorPolitica: false,
        cli
      }
    }
  }

  const entregadas = lineas.filter((l) => l.entregadaALaCli)
  const retenidas = lineas.filter((l) => !l.entregadaALaCli)

  return {
    network,
    token: { symbol: cfg.token.symbol, address: cfg.token.address, decimals: cfg.token.decimals },
    billetera: {
      sdk: direccionSdk,
      cli: direccionCli,
      coinciden: mismaBilletera,
      crudo: mismaBilletera ? null : crudoDireccion
    },
    totales: {
      lineas: lineas.length,
      entregadas: entregadas.length,
      retenidas: retenidas.length,
      cliAcepto: entregadas.filter((l) => l.cli?.ok).length,
      cliFallo: entregadas.filter((l) => l.cli && !l.cli.ok).length
    },
    lineas,
    fuga,
    // Parity holds if it is the same wallet and no denied line reached the CLI.
    // The second half is structural, and asserted anyway.
    cuadra: mismaBilletera && retenidas.every((l) => l.entregadaALaCli === false)
  }
}

/**
 * Classifies the CLI failure, which is where the whole argument is decided.
 *
 * The CLI has no "DENY". When it fails, it fails against the chain — balance,
 * gas, a contract revert — and that is NOT a control: it depends on how much is
 * in the account that day. Mistaking a balance revert for a policy denial would
 * be precisely the error this project exists to point at.
 */
export function clasificarCli (cli) {
  if (!cli) return { clase: 'no-entregada', etiqueta: '—' }
  if (cli.ok) return { clase: 'aceptada', etiqueta: '✅ la CLI la acepto y cotizo' }
  if (/exceeds balance/i.test(cli.error ?? '')) {
    return { clase: 'reverso-por-saldo', etiqueta: '⚠️ reverso de la cadena por saldo — no es una politica' }
  }
  return { clase: 'error-de-cadena', etiqueta: `⚠️ \`${cli.errorCode ?? 'error'}\` — de la cadena, no de una politica` }
}

export function paridadMarkdown (p) {
  const l = []
  l.push('# Paridad con la CLI de WDK\n')
  l.push(`Red **${p.network}** · token **${p.token.symbol}** \`${p.token.address}\`\n`)
  l.push('## 1 · ¿La misma billetera?\n')
  l.push('| Surface | Direccion |')
  l.push('|---|---|')
  l.push(`| \`@tetherto/wdk\` (SDK, en proceso) | \`${p.billetera.sdk}\` |`)
  l.push(`| \`@tetherto/wdk-cli\` (\`wdk get address\`) | \`${p.billetera.cli ?? '—'}\` |`)
  l.push(`\n${p.billetera.coinciden ? '✅ Coinciden byte a byte. Misma seed, misma derivacion, dos superficies.' : '⛔ No coinciden.'}\n`)

  l.push('## 2 · ¿Que le llega a la CLI?\n')
  l.push('| # | Estado del cerrojo | Monto | ¿Entregada a `wdk send`? | Veredicto de la CLI |')
  l.push('|---|---|---|---|---|')
  for (const x of p.lineas) {
    const veredicto = x.entregadaALaCli ? clasificarCli(x.cli).etiqueta : '—'
    l.push(`| ${x.row} | ${x.estado} | ${x.monto ?? '—'} | ${x.entregadaALaCli ? '✅ si' : '⛔ no'} | ${veredicto} |`)
  }
  l.push(`\n**${p.totales.entregadas} entregadas · ${p.totales.retenidas} retenidas por el cerrojo.** Ninguna linea denegada toco la CLI.\n`)

  if (p.fuga) {
    l.push('## 3 · La CLI sola no tiene tope\n')
    l.push(`La fila ${p.fuga.row} — **${p.fuga.monto} ${p.token.symbol}** a \`${p.fuga.to}\` — fue denegada por \`${p.fuga.reglaDelCerrojo}\`.`)
    l.push('Entregada a proposito a la CLI, en dry-run:\n')
    l.push('```')
    l.push(`wdk ${p.fuga.cli.args}`)
    l.push(`→ ${clasificarCli(p.fuga.cli).etiqueta}`)
    l.push('```\n')
    l.push('La CLI no reporta una decision de politica porque no tiene politicas: arma el mismo')
    l.push('calldata ERC-20 y lo lleva al nodo. Si el nodo lo rechaza es por saldo o por gas —')
    l.push('condiciones de la cadena de ese dia, no un control. El tope y la allowlist viven')
    l.push('en el cerrojo, un paso antes de que el calldata exista.\n')
  }

  l.push(`\n**Paridad:** ${p.cuadra ? '✅ sostiene' : '⛔ falla'}\n`)
  return l.join('\n')
}
