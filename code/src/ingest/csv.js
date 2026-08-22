import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { E } from '../errors.js'
import { normalizarMonto } from './amount.js'

export const PROBLEMAS_FILA = {
  DIRECCION_INVALIDA: 'direccion_invalida',
  MONEDA_NO_SOPORTADA: 'moneda_no_soportada',
  COLUMNAS_FALTANTES: 'columnas_faltantes',
  FILA_DUPLICADA: 'fila_duplicada'
}

const CABECERA = ['beneficiario', 'direccion', 'monto', 'moneda', 'concepto']

/** Parser de CSV con soporte de comillas dobles. Sin dependencias. */
export function parsearCSV (texto) {
  const filas = []
  let campo = ''
  let fila = []
  let enComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else { enComillas = false }
      } else campo += c
      continue
    }

    if (c === '"') { enComillas = true; continue }
    if (c === ',') { fila.push(campo); campo = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue }
    campo += c
  }

  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila) }

  return filas.filter((f) => f.some((v) => v.trim() !== ''))
}

/**
 * Lee un CSV de nomina y devuelve filas tipadas.
 *
 * Una fila que no parsea NO aborta la corrida: sale con `problema` y termina
 * como `no_intentada` en el recibo, con su razon.
 */
export function leerNomina (rutaArchivo, { token }) {
  if (!existsSync(rutaArchivo)) throw E.csvIlegible(rutaArchivo, 'el archivo no existe')

  let texto
  try {
    texto = readFileSync(rutaArchivo, 'utf8')
  } catch (err) {
    throw E.csvIlegible(rutaArchivo, err.message)
  }

  const sha256 = createHash('sha256').update(texto).digest('hex')

  // Excel en Windows guarda con BOM. Sin quitarlo, la primera columna se llama
  // "﻿beneficiario" y el archivo entero se rechaza por cabecera invalida.
  const filas = parsearCSV(texto.charCodeAt(0) === 0xFEFF ? texto.slice(1) : texto)

  if (filas.length === 0) throw E.csvIlegible(rutaArchivo, 'el archivo esta vacio')

  const cabecera = filas[0].map((c) => c.trim().toLowerCase())
  const faltantes = CABECERA.filter((c) => !cabecera.includes(c))
  if (faltantes.length > 0) {
    throw E.csvIlegible(rutaArchivo, `faltan columnas: ${faltantes.join(', ')}`)
  }

  const idx = Object.fromEntries(CABECERA.map((c) => [c, cabecera.indexOf(c)]))

  const lineas = filas.slice(1).map((celdas, i) => {
    const row = i + 1
    const valor = (nombre) => (celdas[idx[nombre]] ?? '').trim()

    const linea = {
      row,
      beneficiario: valor('beneficiario'),
      direccion: valor('direccion'),
      montoCrudo: valor('monto'),
      moneda: valor('moneda'),
      // El concepto es DATO. Puede traer texto envenenado y nunca se ejecuta.
      concepto: valor('concepto'),
      amount: null,
      problema: null
    }

    if (celdas.length < CABECERA.length) {
      linea.problema = { codigo: PROBLEMAS_FILA.COLUMNAS_FALTANTES, why: `La fila ${row} no trae las ${CABECERA.length} columnas esperadas.` }
      return linea
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(linea.direccion)) {
      linea.problema = { codigo: PROBLEMAS_FILA.DIRECCION_INVALIDA, why: `La direccion "${linea.direccion}" no tiene la forma de una direccion EVM (0x + 40 hex).` }
      return linea
    }

    if (linea.moneda.toUpperCase() !== token.symbol.toUpperCase()) {
      linea.problema = { codigo: PROBLEMAS_FILA.MONEDA_NO_SOPORTADA, why: `La moneda "${linea.moneda}" no es la de esta corrida (${token.symbol}). No se convierte a otra moneda.` }
      return linea
    }

    const monto = normalizarMonto(linea.montoCrudo, token.decimals)
    if (!monto.ok) {
      linea.problema = { codigo: monto.codigo, why: monto.why }
      return linea
    }

    linea.amount = monto.base
    return linea
  })

  marcarDuplicadas(lineas)

  return { lineas, sha256, ruta: rutaArchivo }
}

/**
 * Marca las filas exactamente repetidas (mismo destinatario, mismo monto, mismo
 * concepto). La segunda no se paga: sale como `no_intentada` con su razon.
 *
 * Un CSV pegado dos veces es el error de nomina mas comun y el mas caro. Pagarlo
 * "porque el archivo lo decia" es justo lo que este proyecto no hace; abstenerse
 * y decir por que deja la decision en manos de una persona.
 */
function marcarDuplicadas (lineas) {
  const vistas = new Map()

  for (const linea of lineas) {
    if (linea.problema) continue

    const clave = `${linea.direccion.toLowerCase()}|${linea.amount}|${linea.concepto.trim().toLowerCase()}`
    const primera = vistas.get(clave)

    if (primera === undefined) {
      vistas.set(clave, linea.row)
      continue
    }

    linea.problema = {
      codigo: PROBLEMAS_FILA.FILA_DUPLICADA,
      why: `La fila ${linea.row} es identica a la fila ${primera} (mismo destinatario, monto y concepto). No se paga dos veces sin una confirmacion explicita.`
    }
  }
}
