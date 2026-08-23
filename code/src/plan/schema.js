// src/plan/schema.js
//
// What a planner is allowed to produce, and nothing beyond it. The schema is the
// boundary the model output has to fit through before any of it counts as a
// plan, which is what keeps a talkative answer from turning into an instruction.

import { z } from 'zod'

export const DIRECCION_EVM = /^0x[0-9a-fA-F]{40}$/

/** What the planner has the right to produce. Nothing else. */
export const EsquemaLineaPlan = z.object({
  row: z.number().int().positive(),
  to: z.string().regex(DIRECCION_EVM),
  amount: z.string().regex(/^\d+$/),
  decimals: z.number().int().nonnegative(),
  token: z.string().min(1),
  network: z.string().min(1),
  // `reason` belongs to the planner (why it proposes this row). `concepto` is the
  // CSV text as it stands: it is DATA, and has to reach the receipt even poisoned.
  reason: z.string().min(1),
  concepto: z.string().optional()
})

export const EsquemaAbstencion = z.object({
  row: z.number().int().positive(),
  why: z.string().min(1),
  concepto: z.string().optional()
})

export const EsquemaPlan = z.object({
  intent: z.string().min(1),
  period: z.string().min(1),
  lines: z.array(EsquemaLineaPlan),
  abstentions: z.array(EsquemaAbstencion)
})

/** What the model is asked for: rows and reasons. Never the seed, source or balance. */
export const EsquemaPropuestaLLM = z.object({
  intent: z.string(),
  period: z.string(),
  incluidas: z.array(z.object({
    row: z.number().int(),
    to: z.string(),
    amount_base: z.string(),
    reason: z.string()
  })),
  abstentions: z.array(z.object({ row: z.number().int(), why: z.string() }))
})

export function validarPlan (candidato) {
  const r = EsquemaPlan.safeParse(candidato)
  if (r.success) return { ok: true, plan: r.data }
  return { ok: false, errores: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
}
