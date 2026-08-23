// src/plan/rules.js
//
// The deterministic planner: no model, no network, no surprises. It exists
// permanently and not merely as a fallback, because it is the proof that the
// lock does not depend on an LLM — `cerrojo run` without `--llm` exercises the
// entire system without switching a model on.

import { EsquemaPlan } from './schema.js'

/** Reads the CSV, proposes every readable row, and abstains on the rest. */
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
