// src/ingest/amount.js
//
// Amount handling, and the one rule it exists to enforce: never a float, never a
// plausible guess. An amount that cannot be read with certainty comes back as a
// stated problem rather than a number, and the row it came from ends up
// `no_intentada` instead of being paid something approximate.

/**
 * Normalises amounts to integers in base units.
 */

export const PROBLEMAS = {
  MONTO_VACIO: 'monto_vacio',
  MONTO_ILEGIBLE: 'monto_ilegible',
  MONTO_NO_POSITIVO: 'monto_no_positivo',
  MONTO_PRECISION: 'monto_precision'
}

/**
 * @param {string} texto - The amount exactly as it came in the CSV.
 * @param {number} decimals - The token decimals.
 * @returns {{ ok: true, base: bigint } | { ok: false, codigo: string, why: string }}
 */
export function normalizarMonto (texto, decimals) {
  const crudo = String(texto ?? '').trim()

  if (crudo === '') {
    return { ok: false, codigo: PROBLEMAS.MONTO_VACIO, why: 'El campo monto llego vacio en el CSV. No se completa con un valor plausible.' }
  }

  let limpio = crudo.replace(/\s/g, '')

  const tieneComa = limpio.includes(',')
  const tienePunto = limpio.includes('.')

  if (tieneComa && tienePunto) {
    // "1.234,56" -> dot for thousands, comma for decimals. "1,234.56" -> the reverse.
    limpio = limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
      ? limpio.replace(/\./g, '').replace(',', '.')
      : limpio.replace(/,/g, '')
  } else if (tieneComa) {
    limpio = limpio.replace(',', '.')
  }

  if (!/^\d+(\.\d+)?$/.test(limpio)) {
    return { ok: false, codigo: PROBLEMAS.MONTO_ILEGIBLE, why: `El monto "${crudo}" no es un numero legible.` }
  }

  const [enteros, decimalesTexto = ''] = limpio.split('.')

  if (decimalesTexto.length > decimals) {
    return {
      ok: false,
      codigo: PROBLEMAS.MONTO_PRECISION,
      why: `El monto "${crudo}" trae ${decimalesTexto.length} decimales y el token solo admite ${decimals}. No se redondea.`
    }
  }

  const base = BigInt(enteros + decimalesTexto.padEnd(decimals, '0'))

  if (base <= 0n) {
    return { ok: false, codigo: PROBLEMAS.MONTO_NO_POSITIVO, why: `El monto "${crudo}" no es positivo.` }
  }

  return { ok: true, base }
}

/** Base-unit integer -> readable text with its decimals. For display only. */
export function formatearMonto (base, decimals) {
  const n = BigInt(base)
  const divisor = 10n ** BigInt(decimals)
  const entero = n / divisor
  const resto = (n % divisor).toString().padStart(decimals, '0')
  return decimals === 0 ? entero.toString() : `${entero}.${resto}`
}
