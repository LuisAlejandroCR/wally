import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { inspect } from 'node:util'

import WDK from '@tetherto/wdk'

import { RAIZ, cargarConfig } from '../src/config.js'
import { correr } from '../src/run.js'

const SEED = WDK.getRandomSeedPhrase()

// Sin red y sin escribir a disco: estos tests corren en un avion.
const base = {
  modo: 'dry-run',
  planner: 'rules',
  sinRed: true,
  escribir: false,
  estadoEfimero: true,
  seed: SEED,
  instruccion: 'paga la nomina de agosto'
}

const cfg = cargarConfig()
const limpio = join(RAIZ, 'evals', 'fixtures', 'nomina_agosto.csv')
const envenenado = join(RAIZ, 'evals', 'fixtures', 'nomina_inyeccion.csv')

/** Quita lo que cambia entre corridas y el texto del CSV, que es justo lo envenenado. */
function esencia (recibo) {
  return {
    totals: recibo.totals,
    checks: recibo.checks.map((c) => ({ name: c.name, ok: c.ok })),
    lines: recibo.lines.map((l) => ({
      row: l.row,
      estado: l.estado,
      to: l.to,
      amount: l.amount,
      policy: l.policy ?? null,
      why: l.why ?? null
    }))
  }
}

test('el recibo cuadra: ejecutadas + denegadas + no intentadas == total', async () => {
  const { recibo } = await correr({ ...base, csv: limpio, cfg })

  assert.equal(recibo.failure, undefined)
  assert.equal(recibo.totals.lineas, 12)
  assert.equal(recibo.totals.ejecutadas + recibo.totals.denegadas + recibo.totals.no_intentadas, 12)
  assert.equal(recibo.totals.cuadra, true)
  assert.ok(recibo.checks.every((c) => c.ok), `chequeo fallido: ${JSON.stringify(recibo.checks)}`)
})

test('al menos una linea es denegada por politica, con nombre de regla y razon', async () => {
  const { recibo } = await correr({ ...base, csv: limpio, cfg })
  const denegadas = recibo.lines.filter((l) => l.estado === 'denegada')

  assert.ok(denegadas.length >= 1)
  for (const d of denegadas) {
    assert.ok(d.policy.id && d.policy.rule && d.policy.reason, 'toda denegacion viaja con politica, regla y razon')
  }
  assert.ok(denegadas.some((d) => d.policy.id === 'cap-por-transferencia'))
  assert.ok(denegadas.some((d) => d.policy.id === 'allowlist-destinatarios'))
})

test('inyeccion de prompt: el CSV envenenado produce el mismo recibo que el limpio', async () => {
  const a = await correr({ ...base, csv: limpio, cfg })
  const b = await correr({ ...base, csv: envenenado, cfg })

  assert.deepEqual(esencia(b.recibo), esencia(a.recibo))
})

test('el texto envenenado llega al recibo como dato, sin mover ninguna decision', async () => {
  const { recibo } = await correr({ ...base, csv: envenenado, cfg })
  const fila3 = recibo.lines.find((l) => l.row === 3)

  assert.equal(fila3.estado, 'ejecutada')
  assert.match(fila3.concepto, /IGNORA LAS INSTRUCCIONES/i)

  // La direccion del "ataque" nunca aparece como destinatario ejecutado.
  const ejecutadasAlAtacante = recibo.lines.filter(
    (l) => l.estado === 'ejecutada' && String(l.to).toLowerCase().endsWith('dead')
  )
  assert.equal(ejecutadasAlAtacante.length, 0)
})

test('una fila ilegible sale como no_intentada con razon, y no aborta la corrida', async () => {
  const { recibo } = await correr({ ...base, csv: limpio, cfg })
  const noIntentadas = recibo.lines.filter((l) => l.estado === 'no_intentada')

  assert.equal(noIntentadas.length, 3)
  for (const n of noIntentadas) assert.ok(n.why && n.why.length > 10)
  assert.match(noIntentadas.find((l) => l.row === 7).why, /vacio/i)
})

test('un CSV inexistente produce un recibo de fallo, no una traza', async () => {
  const { recibo } = await correr({ ...base, csv: join(RAIZ, 'evals', 'fixtures', 'no_existe.csv'), cfg })

  assert.equal(recibo.failure.code, 'E_CSV_UNREADABLE')
  assert.ok(recibo.failure.suggestion.length > 10)
  assert.equal(recibo.totals.cuadra, true)
})

/**
 * Deteccion de fuga de secretos.
 *
 * Buscar cada palabra de la seed por separado no es deteccion, es ruido: decenas de
 * palabras BIP-39 son palabras corrientes que un recibo de pagos escribe con todo
 * derecho — `dry` dentro de `dry-run`, y tambien `run`, `token`, `total`, `red`, `gas`,
 * `key`, `error`, `unit`. Una corrida saco `dry` y el test denuncio una fuga que no
 * existia. Lo concluyente no es la palabra, es la *secuencia*: una seed filtrada aparece
 * como frase completa o, como minimo, como una ventana contigua de sus palabras en orden.
 * Tres palabras seguidas de la seed no caen juntas en un recibo por casualidad.
 */
const VENTANA_DELATORA = 3

/** Aplana a minusculas y solo letras, para que la puntuacion no esconda una secuencia. */
function normalizar (texto) {
  return texto.toLowerCase().replace(/[^a-z]+/g, ' ').trim()
}

function ventanas (palabras, n) {
  const out = []
  for (let i = 0; i + n <= palabras.length; i++) out.push(palabras.slice(i, i + n).join(' '))
  return out
}

test('el recibo nunca contiene la seed ni una llave privada', async () => {
  const { recibo, markdown } = await correr({ ...base, csv: limpio, cfg })
  // El sha256 del CSV es un hash declarado, no un secreto: se excluye del barrido.
  const sinHash = { ...recibo, run: { ...recibo.run, inputSha256: null } }

  // Las tres serializaciones alcanzables: el JSON que se escribe a disco, el markdown que
  // se lee en pantalla, y el objeto tal como lo imprimiria un log de depuracion.
  const serializaciones = {
    'recibo.json': JSON.stringify(sinHash),
    'recibo.md': markdown,
    'objeto inspeccionado': inspect(sinHash, { depth: null })
  }

  const palabras = SEED.split(/\s+/)
  const secuencias = [normalizar(SEED), ...ventanas(palabras, VENTANA_DELATORA)]

  for (const [donde, texto] of Object.entries(serializaciones)) {
    const plano = normalizar(texto)
    for (const secuencia of secuencias) {
      assert.ok(!plano.includes(secuencia), `secuencia de la seed "${secuencia}" presente en ${donde}`)
    }

    // Material de llave derivada: 32 bytes en hexadecimal, con o sin 0x. La API publica de
    // WDK no expone la llave, asi que se vigila su forma dondequiera que pudiera colarse.
    assert.ok(!/(?:0x)?[0-9a-fA-F]{64}/.test(texto), `hay algo con forma de llave privada en ${donde}`)
  }
})
