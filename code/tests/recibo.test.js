// tests/recibo.test.js
//
// The receipt as a contract: three states that add up, a reason on every
// refusal, and a poisoned CSV producing the same receipt as the clean one. The
// last block is the secret-leak sweep, which looks for contiguous sequences of
// seed words rather than single words — see the note above it for why.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { inspect } from 'node:util'

import WDK from '@tetherto/wdk'

import { RAIZ, cargarConfig } from '../src/config.js'
import { correr } from '../src/run.js'

const SEED = WDK.getRandomSeedPhrase()

// No network and no disk writes: these tests run on a plane.
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

/** Strips what varies between runs, and the CSV text, which is the poisoned part. */
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

  // The "attack" address never appears as an executed recipient.
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
 * Secret-leak detection.
 *
 * Searching for each seed word on its own is not detection, it is noise: dozens of
 * BIP-39 words are ordinary words a payment receipt writes with every right —
 * `dry` inside `dry-run`, and also `run`, `token`, `total`, `red`, `gas`, `key`,
 * `error`, `unit`. One run emitted `dry` and the test reported a leak that did not
 * exist. What is conclusive is not the word but the *sequence*: a leaked seed shows
 * up as the whole phrase or, at minimum, as a contiguous window of its words in
 * order. Three consecutive seed words do not land together in a receipt by chance.
 */
const VENTANA_DELATORA = 3

/** Flattens to lowercase letters only, so punctuation cannot hide a sequence. */
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
  // The CSV sha256 is a declared hash, not a secret: excluded from the sweep.
  const sinHash = { ...recibo, run: { ...recibo.run, inputSha256: null } }

  // The three reachable serialisations: the JSON written to disk, the markdown read
  // on screen, and the object as a debug log would print it.
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

    // Derived key material: 32 bytes of hex, with or without 0x. The public WDK API
    // does not expose the key, so its shape is watched wherever it could slip through.
    assert.ok(!/(?:0x)?[0-9a-fA-F]{64}/.test(texto), `hay algo con forma de llave privada en ${donde}`)
  }
})
