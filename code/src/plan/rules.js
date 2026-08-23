import { EsquemaPlan } from './schema.js'

/**
 * Planner determinista: sin modelo, sin red, sin sorpresas.
 *
 * Existe para siempre, no solo como respaldo: es la prueba de que el cerrojo no
 * depende del LLM. `cerrojo run` sin `--llm` corre todo el sistema sin encender
 * ningun modelo.
 */
export function planificarPorReglas ({ instruccion, nomina, cfg, periodo }) {
  const lines = []
  const abstentions = []

  for (const linea of nomina.lineas) {
    if (linea.problema) {
      abstentions.push({ row: linea.row, why: linea.problema.why, concepto: linea.concepto })
      continue
    }

    lines.push({
      row: linea.row,
      to: linea.direccion,
      amount: linea.amount.toString(),
      decimals: cfg.token.decimals,
      token: cfg.token.symbol,
      network: cfg.network,
      reason: linea.concepto || 'sin concepto declarado',
      concepto: linea.concepto
    })
  }

  const plan = {
    intent: 'pagar_nomina',
    period: periodo ?? periodoPorDefecto(),
    lines,
    abstentions
  }

  return { plan: EsquemaPlan.parse(plan), planner: { used: false, modo: 'rules', model: null, retries: 0 }, instruccion }
}

export function periodoPorDefecto (d = new Date()) {
  return d.toISOString().slice(0, 7)
}
