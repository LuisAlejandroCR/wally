import { planificarPorReglas } from './rules.js'
import { planificarConLLM } from './llm.js'

export { planificarPorReglas, planificarConLLM }

/**
 * Arma el plan.
 *
 *   modo 'rules' -> determinista, sin red ni modelo. Es el modo por defecto de `cerrojo run`.
 *   modo 'llm'   -> el modelo propone y el codigo verifica contra el CSV. Lo activa `--llm`.
 *
 * En los dos casos la salida es el mismo `PaymentPlan`, y en los dos casos el
 * plan es un documento: para convertirse en dinero tiene que atravesar policy/.
 */
export async function armarPlan ({ instruccion, nomina, cfg, periodo, modo = 'rules', cliente = null }) {
  if (modo === 'llm') return planificarConLLM({ instruccion, nomina, cfg, periodo, cliente })
  return planificarPorReglas({ instruccion, nomina, cfg, periodo })
}
