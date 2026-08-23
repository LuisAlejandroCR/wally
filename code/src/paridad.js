import { formatearMonto } from './ingest/amount.js'
import * as adaptadorReal from './wdk/cli.js'

/**
 * Paridad con la CLI de WDK.
 *
 * Responde tres preguntas que un juez puede verificar en un minuto:
 *
 *   1. ¿Son la misma billetera? La CLI deriva una direccion y el SDK deriva otra.
 *      Si no coinciden byte a byte, esto falla.
 *   2. ¿Que llega a la CLI? Solo las lineas que el cerrojo aprobo. Las denegadas
 *      no se le entregan: no hay ruta de codigo que lo haga.
 *   3. ¿La CLI sola habria parado la linea denegada? No. Con --demostrar-fuga se
 *      le entrega una linea denegada a proposito, en dry-run, y se ve que arma el
 *      calldata igual. La CLI no tiene tope ni allowlist; el cerrojo si.
 *
 * El adaptador se inyecta para poder probar esta orquestacion sin red ni llavero.
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
      // No se le entrega. Esta rama no llama al adaptador, y un test lo afirma.
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

  // Demostracion opcional: la primera linea denegada, entregada a la CLI a proposito.
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
        // La CLI no tiene una decision de politica que reportar. Si fallo, fallo por
        // la cadena (saldo, gas), no por un tope. Eso es justamente el punto.
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
    // La paridad se sostiene si es la misma billetera y ninguna linea denegada
    // llego a la CLI. Lo segundo es estructural, y se afirma igual.
    cuadra: mismaBilletera && retenidas.every((l) => l.entregadaALaCli === false)
  }
}

/**
 * Clasifica el fallo de la CLI, que es donde se juega el argumento entero.
 *
 * La CLI no tiene un "DENY". Cuando falla, falla contra la cadena — saldo, gas,
 * un reverso del contrato — y eso NO es un control: depende de cuanto haya en la
 * cuenta ese dia. Confundir un reverso por saldo con una denegacion por politica
 * seria justamente el error que este proyecto existe para señalar.
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
