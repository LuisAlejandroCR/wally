import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'

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
const limpio = join(RAIZ, 'data', 'nomina_agosto.csv')
const envenenado = join(RAIZ, 'data', 'nomina_inyeccion.csv')

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
  const { recibo } = await correr({ ...base, csv: join(RAIZ, 'data', 'no_existe.csv'), cfg })

  assert.equal(recibo.failure.code, 'E_CSV_UNREADABLE')
  assert.ok(recibo.failure.suggestion.length > 10)
  assert.equal(recibo.totals.cuadra, true)
})

test('el recibo nunca contiene la seed ni una llave privada', async () => {
  const { recibo } = await correr({ ...base, csv: limpio, cfg })
  // El sha256 del CSV es un hash declarado, no un secreto: se excluye del barrido.
  const texto = JSON.stringify({ ...recibo, run: { ...recibo.run, inputSha256: null } })

  for (const palabra of SEED.split(/\s+/)) {
    assert.ok(!new RegExp(`\\b${palabra}\\b`).test(texto), `la palabra "${palabra}" de la seed aparece en el recibo`)
  }
  assert.ok(!/[0-9a-fA-F]{64}/.test(texto), 'hay algo con forma de llave privada en el recibo')
})
