// tests/api.test.js
//
// Drives the HTTP API on an ephemeral port and checks what a caller is actually
// handed: a health endpoint that declares dry-run, a denial that names the
// engine's own policy and rule, bad input coming back as a typed 400 rather than
// a 500, and a receipt that balances with no transaction hash on any line.

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { join } from 'node:path'

import { RAIZ, cargarConfig } from '../src/config.js'
import { crearApi } from '../src/api/server.js'
import { SEED } from './semilla.js'

const cfg = cargarConfig({ CERROJO_STATE_DIR: join(RAIZ, 'state', 'tests-api') })

let servidor
let base
let seedPrevia

before(async () => {
  // The API opens a session per request and reads the seed from the environment, so
  // it goes here and not in an argument: the config object does not carry the seed,
  // and that is not going to be bent for a test.
  seedPrevia = process.env.CERROJO_SEED
  process.env.CERROJO_SEED = SEED

  servidor = crearApi({ cfg })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(() => {
  servidor?.close()
  if (seedPrevia === undefined) delete process.env.CERROJO_SEED
  else process.env.CERROJO_SEED = seedPrevia
})

const get = async (ruta) => (await fetch(base + ruta)).json()
const post = async (ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo)
  })
  return { estado: res.status, cuerpo: await res.json() }
}

test('/salud declara que la API no puede enviar fondos', async () => {
  const r = await get('/salud')

  assert.equal(r.ok, true)
  assert.equal(r.modo, 'dry-run')
  assert.equal(r.red, cfg.network)
})

test('/politicas lista el cerrojo sin filtrar la allowlist ni un secreto', async () => {
  const r = await get('/politicas')

  assert.equal(r.politicas.length, 5)
  assert.equal(typeof r.destinatariosPermitidos, 'number')
  assert.ok(!JSON.stringify(r).match(/seed|mnemonic|private/i))
  // The API says how many recipients there are, not who they are.
  assert.ok(!Array.isArray(r.allowlist))
})

test('POST /simular deniega un destinatario fuera de la lista, con regla y razon', async () => {
  const { estado, cuerpo } = await post('/simular', {
    destinatario: '0x000000000000000000000000000000000000dEaD',
    monto_base: '400000000'
  })

  assert.equal(estado, 200)
  assert.equal(cuerpo.decision, 'DENY')
  assert.equal(cuerpo.politica, 'allowlist-destinatarios')
  assert.equal(cuerpo.regla, 'denegar-fuera-de-lista')
})

test('POST /simular rechaza una entrada invalida con 400 y arreglo sugerido, no con un 500', async () => {
  const monto = await post('/simular', { destinatario: '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b', monto_base: '250,00' })
  assert.equal(monto.estado, 400)
  assert.equal(monto.cuerpo.error.code, 'E_MONTO_INVALIDO')
  assert.match(monto.cuerpo.error.suggestion, /unidades base/)

  const destino = await post('/simular', { destinatario: 'la cuenta de Ana', monto_base: '1000000' })
  assert.equal(destino.estado, 400)
  assert.equal(destino.cuerpo.error.code, 'E_DESTINATARIO_INVALIDO')
})

test('una ruta que no existe devuelve 404 con la lista de endpoints', async () => {
  const res = await fetch(`${base}/enviar-todo`, { method: 'POST' })
  const cuerpo = await res.json()

  assert.equal(res.status, 404)
  assert.equal(cuerpo.error.code, 'E_NO_ENCONTRADO')
  assert.match(cuerpo.error.suggestion, /\/simular/)
})

test('no hay ningun endpoint que envie: /correr es dry-run y el recibo cuadra', async () => {
  const { estado, cuerpo } = await post('/correr', { instruccion: 'paga la nomina de agosto' })

  assert.equal(estado, 200)
  assert.equal(cuerpo.recibo.run.mode, 'dry-run')
  assert.equal(cuerpo.recibo.totals.cuadra, true)
  assert.ok(cuerpo.recibo.lines.every((l) => l.txHash === null || l.txHash === undefined))
})
