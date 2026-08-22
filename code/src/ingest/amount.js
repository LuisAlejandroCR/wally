/**
 * Normalizacion de montos a enteros en unidades base.
 *
 * Regla del proyecto: nunca floats, nunca un valor plausible. Si el monto no se
 * puede leer con certeza, se devuelve un problema con razon y la fila termina
 * como `no_intentada`.
 */

export const PROBLEMAS = {
  MONTO_VACIO: 'monto_vacio',
  MONTO_ILEGIBLE: 'monto_ilegible',
  MONTO_NO_POSITIVO: 'monto_no_positivo',
  MONTO_PRECISION: 'monto_precision'
}

/**
 * @param {string} texto - El monto tal como venia en el CSV.
 * @param {number} decimals - Decimales del token.
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
    // "1.234,56" -> punto de miles, coma decimal. "1,234.56" -> al reves.
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

/** Entero en unidades base -> texto legible con sus decimales. Solo para mostrar. */
export function formatearMonto (base, decimals) {
  const n = BigInt(base)
  const divisor = 10n ** BigInt(decimals)
  const entero = n / divisor
  const resto = (n % divisor).toString().padStart(decimals, '0')
  return decimals === 0 ? entero.toString() : `${entero}.${resto}`
}
