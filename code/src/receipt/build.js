import { correrChequeos } from './checks.js'

export const VERSION_RECIBO = '1'

/**
 * Arma el recibo: el entregable que lee el jurado.
 *
 * Tres estados exhaustivos y excluyentes por linea. Si la suma no cuadra, no se
 * emite un recibo normal: se emite un recibo de fallo. Esta funcion nunca lanza.
 */
export function construirRecibo ({
  runId,
  startedAt,
  finishedAt,
  modo,
  cfg,
  instruccion,
  entrada,
  planner,
  plan,
  resultados,
  politicas,
  allowlist,
  ledger,
  panelMainnet = null
}) {
  const lineas = [
    ...resultados,
    ...plan.abstentions.map((a) => ({
      row: a.row,
      estado: 'no_intentada',
      to: null,
      amount: null,
      decimals: cfg.token.decimals,
      token: cfg.token.symbol,
      concepto: a.concepto ?? null,
      why: a.why
    }))
  ].sort((a, b) => a.row - b.row)

  const ejecutadas = lineas.filter((l) => l.estado === 'ejecutada')
  const denegadas = lineas.filter((l) => l.estado === 'denegada')
  const noIntentadas = lineas.filter((l) => l.estado === 'no_intentada')

  const totales = {
    lineas: plan.lines.length + plan.abstentions.length,
    ejecutadas: ejecutadas.length,
    denegadas: denegadas.length,
    no_intentadas: noIntentadas.length,
    montoEjecutado: sumar(ejecutadas),
    montoDenegado: sumar(denegadas),
    decimals: cfg.token.decimals
  }
  totales.cuadra = totales.ejecutadas + totales.denegadas + totales.no_intentadas === totales.lineas

  const checks = correrChequeos({ lineas, totales, allowlist })

  const recibo = {
    version: VERSION_RECIBO,
    run: {
      id: runId,
      startedAt,
      finishedAt,
      mode: modo,
      network: cfg.network,
      token: { slug: cfg.token.symbol.toLowerCase(), decimals: cfg.token.decimals, address: cfg.token.address },
      instruction: instruccion,
      inputFile: entrada.ruta,
      inputSha256: entrada.sha256,
      planner
    },
    totals: totales,
    lines: lineas,
    checks,
    policiesApplied: politicas.map((p) => ({
      id: p.id,
      scope: p.scope,
      ...(p.id === 'cap-diario' && ledger
        ? { estadoFinal: `${ledger.gastado} / ${cfg.capDay}`, restanteHoy: ledger.restante(cfg.capDay).toString() }
        : {})
    })),
    ...(panelMainnet ? { mainnetSoloLectura: panelMainnet } : {})
  }

  return recibo
}

/**
 * Recibo de fallo. La corrida no se completo y **igual sale un recibo**: la suma
 * sigue cuadrando (todo `no_intentada`) y el error trae su arreglo sugerido.
 */
export function reciboDeFallo ({ runId, startedAt, modo, cfg, error, totalLineas = 0, instruccion = null, entrada = null }) {
  const fallo = typeof error?.toJSON === 'function'
    ? error.toJSON()
    : { code: 'E_DESCONOCIDO', message: String(error?.message ?? error), suggestion: 'Revisa la corrida completa y reporta el caso.', stage: 'desconocido' }

  return {
    version: VERSION_RECIBO,
    run: {
      id: runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      mode: modo,
      network: cfg?.network ?? null,
      instruction: instruccion,
      inputFile: entrada?.ruta ?? null,
      inputSha256: entrada?.sha256 ?? null,
      aborted: true
    },
    failure: fallo,
    totals: {
      lineas: totalLineas,
      ejecutadas: 0,
      denegadas: 0,
      no_intentadas: totalLineas,
      cuadra: true,
      montoEjecutado: '0',
      montoDenegado: '0',
      decimals: cfg?.token?.decimals ?? 0
    },
    lines: [],
    checks: [{ name: 'suma_cuadra', ok: true, detail: `${totalLineas} lineas, ninguna intentada` }]
  }
}

function sumar (lineas) {
  return lineas.reduce((acc, l) => acc + BigInt(l.amount ?? 0), 0n).toString()
}
