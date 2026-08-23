// src/plan/index.js
//
// Builds the plan, either deterministically or with a model, and returns the
// same PaymentPlan shape from both. Whichever route produced it, a plan is a
// document and nothing more: to become money it has to cross policy/ first.

import { planificarPorReglas } from './rules.js'
import { planificarConLLM } from './llm.js'

export { planificarPorReglas, planificarConLLM }

/**
 *   mode 'rules' -> deterministic, no network and no model. The default for `cerrojo run`.
 *   mode 'llm'   -> the model proposes and the code verifies against the CSV. Enabled by `--llm`.
 */
export async function armarPlan ({ instruccion, nomina, cfg, periodo, modo = 'rules', cliente = null }) {
  if (modo === 'llm') return planificarConLLM({ instruccion, nomina, cfg, periodo, cliente })
  return planificarPorReglas({ instruccion, nomina, cfg, periodo })
}
