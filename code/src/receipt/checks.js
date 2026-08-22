/**
 * Los chequeos deterministas del recibo.
 *
 * Ninguno usa la red ni el modelo. Si `suma_cuadra` es false, el recibo normal
 * no se emite: se degrada a recibo de fallo. Los otros tres se reportan.
 */
export function correrChequeos ({ lineas, totales, allowlist }) {
  const permitidas = new Set(allowlist.map((a) => a.toLowerCase()))

  const sumaCuadra = totales.ejecutadas + totales.denegadas + totales.no_intentadas === totales.lineas

  const montosEnteros = lineas.every((l) => l.amount === null || l.amount === undefined || /^\d+$/.test(String(l.amount)))

  const ejecutadasFuera = lineas.filter((l) => l.estado === 'ejecutada' && l.to && !permitidas.has(String(l.to).toLowerCase()))
  const denegadasFuera = lineas.filter((l) => l.estado === 'denegada' && l.to && !permitidas.has(String(l.to).toLowerCase()))

  const vistas = new Map()
  const duplicadas = []
  for (const l of lineas) {
    if (l.estado !== 'ejecutada' || !l.to) continue
    const clave = `${String(l.to).toLowerCase()}:${l.amount}`
    if (vistas.has(clave)) duplicadas.push({ row: l.row, choca_con: vistas.get(clave) })
    else vistas.set(clave, l.row)
  }

  return [
    {
      name: 'suma_cuadra',
      ok: sumaCuadra,
      detail: `${totales.ejecutadas} ejecutadas + ${totales.denegadas} denegadas + ${totales.no_intentadas} no intentadas = ${totales.ejecutadas + totales.denegadas + totales.no_intentadas} de ${totales.lineas}`
    },
    {
      name: 'montos_enteros',
      ok: montosEnteros,
      detail: 'Todos los montos viajan como enteros en unidades base, en string.'
    },
    {
      name: 'destinatarios_en_allowlist',
      ok: ejecutadasFuera.length === 0,
      detail: ejecutadasFuera.length === 0
        ? `${denegadasFuera.length} linea(s) fuera de la lista fueron denegadas, ninguna ejecutada`
        : `⚠️ ${ejecutadasFuera.length} linea(s) ejecutadas hacia direcciones fuera de la lista: filas ${ejecutadasFuera.map((l) => l.row).join(', ')}`
    },
    {
      name: 'sin_duplicados',
      ok: duplicadas.length === 0,
      detail: duplicadas.length === 0
        ? 'Ninguna pareja (destinatario, monto) se ejecuto dos veces.'
        : `Pares repetidos: ${duplicadas.map((d) => `fila ${d.row} choca con fila ${d.choca_con}`).join('; ')}`
    }
  ]
}
