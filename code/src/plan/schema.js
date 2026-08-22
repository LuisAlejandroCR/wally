import { z } from 'zod'

export const DIRECCION_EVM = /^0x[0-9a-fA-F]{40}$/

/** Lo que el planner tiene derecho a producir. Nada mas. */
export const EsquemaLineaPlan = z.object({
  row: z.number().int().positive(),
  to: z.string().regex(DIRECCION_EVM),
  amount: z.string().regex(/^\d+$/),
  decimals: z.number().int().nonnegative(),
  token: z.string().min(1),
  network: z.string().min(1),
  reason: z.string().min(1)
})

export const EsquemaAbstencion = z.object({
  row: z.number().int().positive(),
  why: z.string().min(1)
})

export const EsquemaPlan = z.object({
  intent: z.string().min(1),
  period: z.string().min(1),
  lines: z.array(EsquemaLineaPlan),
  abstentions: z.array(EsquemaAbstencion)
})

/** Lo que se le pide al modelo: filas y razones. Nunca la seed, el origen ni el saldo. */
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
