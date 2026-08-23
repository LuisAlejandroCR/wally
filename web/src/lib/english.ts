/**
 * English renderings of the strings the engine writes in Spanish.
 *
 * The rule this file obeys: **a translation never replaces a verdict.** Every
 * function here is keyed on a stable identifier (a policy id, a rule name, a
 * check name) or on an exact pattern, re-inserts the engine's own numbers, and
 * returns `null` the moment it does not recognise the input. The interface then
 * shows the original untouched. Nothing is paraphrased, nothing is guessed, and
 * the verbatim string stays on screen next to the translation so a reader can
 * check the two against each other.
 */

/** Policy display names, by policy id. */
const POLICY_NAME: Record<string, string> = {
  'transferencia-de-nomina': 'Allow token transfers only',
  'cap-por-transferencia': 'Per-transfer cap',
  'allowlist-destinatarios': 'Allowed recipients only',
  'solo-token-esperado': 'The payroll token only',
  'cap-diario': 'Accumulated daily cap',
  'mainnet-solo-lectura': 'Mainnet is read-only'
}

/** Rule display names, by rule name. */
const RULE_NAME: Record<string, string> = {
  'permitir-transfer': 'allow-transfer',
  'denegar-sobre-tope': 'deny-over-cap',
  'denegar-fuera-de-lista': 'deny-off-list',
  'denegar-otro-token': 'deny-other-token',
  'denegar-sobre-acumulado': 'deny-over-daily-total',
  'no-applicable-rule': 'no-applicable-rule'
}

export function policyNameEn (id: string): string | null {
  return POLICY_NAME[id] ?? null
}

export function ruleNameEn (name: string): string | null {
  return RULE_NAME[name] ?? null
}

/**
 * Denial reasons, by `<policy id>/<rule>`. Each entry pulls the figures out of
 * the engine's own sentence, so a changed cap shows the changed number and a
 * sentence that no longer parses falls back to the original.
 */
const REASON: Record<string, (raw: string) => string | null> = {
  'cap-por-transferencia/denegar-sobre-tope': (raw) => {
    const m = raw.match(/de (\d+) unidades base \(([\d.]+) ([A-Z]+)\)/)
    return m ? `Over the per-transfer cap of ${m[1]} base units (${m[2]} ${m[3]}).` : null
  },
  'cap-diario/denegar-sobre-acumulado': (raw) => {
    const m = raw.match(/de (\d+) unidades base \(([\d.]+) ([A-Z]+)\)/)
    return m ? `The day's total would go over the daily cap of ${m[1]} base units (${m[2]} ${m[3]}).` : null
  },
  'allowlist-destinatarios/denegar-fuera-de-lista': (raw) =>
    raw.startsWith('El destinatario no esta en la lista')
      ? 'The recipient is not on the list of allowed beneficiaries.'
      : null,
  'solo-token-esperado/denegar-otro-token': (raw) => {
    const m = raw.match(/mueve ([A-Za-z0-9]+) en (0x[0-9a-fA-F]{40})/)
    return m ? `This run only moves ${m[1]} at ${m[2]}. Any other contract is denied.` : null
  }
}

export function reasonEn (policyId: string, rule: string, raw: string): string | null {
  return REASON[`${policyId}/${rule}`]?.(raw) ?? null
}

/** Reasons a line was never attempted. Patterns, with the engine's values kept. */
const WHY: { test: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  {
    test: /^El campo monto llego vacio en el CSV/,
    en: () => 'The amount cell arrived empty in the CSV. It is not filled in with a plausible value.'
  },
  {
    test: /^La direccion "(.*)" no tiene la forma de una direccion EVM/,
    en: (m) => `The address "${m[1]}" is not shaped like an EVM address (0x followed by 40 hex characters).`
  },
  {
    test: /^La moneda "(.*)" no es la de esta corrida \(([A-Za-z0-9]+)\)/,
    en: (m) => `Currency "${m[1]}" is not the one this run handles (${m[2]}). It is not converted.`
  },
  {
    test: /^La fila (\d+) repite/,
    en: (m) => `Row ${m[1]} repeats an earlier (recipient, amount) pair. A duplicate is not paid twice.`
  },
  {
    test: /^El envio fallo antes de confirmarse: (.*)$/,
    en: (m) => `The send failed before it was confirmed: ${m[1]}`
  }
]

export function whyEn (raw: string | null | undefined): string | null {
  if (!raw) return null
  for (const { test, en } of WHY) {
    const m = raw.match(test)
    if (m) return en(m)
  }
  return null
}

/** The four deterministic checks. */
const CHECK_LABEL: Record<string, string> = {
  suma_cuadra: 'the three states add up',
  montos_enteros: 'amounts are integers',
  destinatarios_en_allowlist: 'recipients are on the allowlist',
  sin_duplicados: 'no duplicates'
}

const CHECK_DETAIL: Record<string, (raw: string) => string | null> = {
  suma_cuadra: (raw) => {
    const m = raw.match(/(\d+) ejecutadas \+ (\d+) denegadas \+ (\d+) no intentadas = (\d+) de (\d+)/)
    return m ? `${m[1]} executed + ${m[2]} denied + ${m[3]} not attempted = ${m[4]} of ${m[5]}` : null
  },
  montos_enteros: (raw) =>
    raw.startsWith('Todos los montos viajan como enteros')
      ? 'Every amount travels as an integer in base units, as a string.'
      : null,
  destinatarios_en_allowlist: (raw) => {
    const m = raw.match(/^(\d+) linea\(s\) fuera de la lista fueron denegadas, ninguna ejecutada/)
    if (m) return `${m[1]} line(s) off the list were denied, none executed.`
    return raw.startsWith('Ninguna linea fuera de la lista') ? 'No line off the list was attempted.' : null
  },
  sin_duplicados: (raw) =>
    raw.startsWith('Ninguna pareja')
      ? 'No (recipient, amount) pair was executed twice.'
      : null
}

export function checkLabelEn (name: string): string | null {
  return CHECK_LABEL[name] ?? null
}

export function checkDetailEn (name: string, raw: string): string | null {
  return CHECK_DETAIL[name]?.(raw) ?? null
}

/** The note attached to an estimated, non-exact fee. */
export function quoteNoteEn (raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/^Estimacion: tarifa de red x (\d+) de gas\. La cotizacion exacta exige fondos en la tesoreria \((.*)\)\.$/)
  if (!m) return null
  return `Estimate: network fee rate × ${m[1]} gas. An exact quote needs funds in the treasury (${m[2]}).`
}
