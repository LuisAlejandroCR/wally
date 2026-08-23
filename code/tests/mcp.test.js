// tests/mcp.test.js
//
// The agent channel, held to the properties it claims. The suite starts a real
// MCP server over stdio and talks to it as a client would, so what it asserts is
// what an agent would actually be handed: tools that read and propose, no tool
// that approves, and no route to a signature or a secret.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { RAIZ } from '../src/config.js'
import { entorno } from './semilla.js'

let cliente

before(async () => {
  // A day's state of its own: the test cannot depend on what the demos spent today.
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [join(RAIZ, 'src', 'mcp', 'server.js')],
    cwd: RAIZ,
    env: entorno('tests-mcp')
  })
  cliente = new Client({ name: 'cerrojo-tests', version: '1.0.0' })
  await cliente.connect(transporte)
})

after(async () => { await cliente?.close() })

const llamar = async (name, args = {}) => {
  const r = await cliente.callTool({ name, arguments: args })
  return r.content[0].text
}

test('el servidor MCP expone las herramientas de Cerrojo', async () => {
  const { tools } = await cliente.listTools()
  const nombres = tools.map((t) => t.name)

  assert.ok(nombres.includes('cerrojo_politicas'))
  assert.ok(nombres.includes('cerrojo_simular_pago'))
  assert.ok(nombres.includes('cerrojo_correr_nomina'))
  assert.ok(nombres.includes('cerrojo_saldo'))
  assert.ok(nombres.includes('cerrojo_cotizar'))
  assert.ok(nombres.includes('cerrojo_proponer_pago'))
  assert.ok(nombres.includes('cerrojo_estado_vale'))

  // No tool sends live. That is the property, not a detail.
  assert.ok(!nombres.some((n) => /enviar|send|firmar|sign|live/i.test(n)))
})

test('el agente puede proponer un pago y NO puede aprobarlo', async () => {
  const { tools } = await cliente.listTools()
  const nombres = tools.map((t) => t.name)

  assert.ok(nombres.includes('cerrojo_proponer_pago'), 'proponer existe en el canal del agente')

  // The whole asymmetry of the safety model fits in this assertion: approving is
  // not here. It lives in the CLI, where a person types it.
  assert.ok(
    !nombres.some((n) => /aprobar|approve|autoriz|authoriz|confirm/i.test(n)),
    `ninguna herramienta MCP puede aprobar un vale, y se ofrecen: ${nombres.join(', ')}`
  )
})

test('proponer un pago fuera de la allowlist no crea ningun vale', async () => {
  const r = JSON.parse(await llamar('cerrojo_proponer_pago', {
    destinatario: '0x000000000000000000000000000000000000dEaD',
    monto_base: '100000000',
    motivo: 'prueba del canal de agentes'
  }))

  assert.equal(r.creado, false)
  assert.equal(r.decision, 'DENY')
  assert.equal(r.politica, 'allowlist-destinatarios')
  assert.equal(r.vale, undefined, 'un DENY no deja nada que un humano pueda aprobar por error')
})

test('un pago dentro de las reglas deja un vale propuesto, no ejecutado', async () => {
  const r = JSON.parse(await llamar('cerrojo_proponer_pago', {
    destinatario: '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b',
    monto_base: '120000000',
    motivo: 'anticipo de agosto'
  }))

  assert.equal(r.creado, true)
  assert.equal(r.estado, 'propuesto')
  assert.match(r.vale, /^vale_/)
  assert.equal(r.huella.length, 64, 'la orden queda sellada con una huella sha256')
  assert.match(r.siguiente_paso, /cerrojo aprobar/)

  // Looking at a voucher does not move it: it is still waiting on a person.
  const estado = JSON.parse(await llamar('cerrojo_estado_vale', { vale: r.vale }))
  assert.equal(estado.existe, true)
  assert.equal(estado.estado, 'propuesto')
  assert.equal(estado.motivo, 'anticipo de agosto')
  assert.equal(estado.resuelto, null)
})

test('cerrojo_saldo lee la tesoreria sin exponer un solo secreto', async () => {
  const r = JSON.parse(await llamar('cerrojo_saldo'))

  assert.equal(r.red, 'sepolia')
  assert.match(r.tesoreria, /^0x[0-9a-fA-F]{40}$/)
  assert.ok('saldo_token_base' in r, 'informa el saldo del token, aunque el RPC no conteste')
  assert.ok(!JSON.stringify(r).match(/seed|mnemonic|private|xprv/i))
})

test('un agente por MCP no puede pagar fuera de la allowlist', async () => {
  const r = JSON.parse(await llamar('cerrojo_simular_pago', {
    destinatario: '0x000000000000000000000000000000000000dEaD',
    monto_base: '400000000'
  }))

  assert.equal(r.decision, 'DENY')
  assert.equal(r.politica, 'allowlist-destinatarios')
  assert.ok(r.razon.length > 10)
})

test('un agente por MCP no puede pasarse del tope por transferencia', async () => {
  const r = JSON.parse(await llamar('cerrojo_simular_pago', {
    destinatario: '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b',
    monto_base: '900000000'
  }))

  assert.equal(r.decision, 'DENY')
  assert.equal(r.politica, 'cap-por-transferencia')
})

test('un pago dentro de las reglas se permite, y la traza viaja con el veredicto', async () => {
  const r = JSON.parse(await llamar('cerrojo_simular_pago', {
    destinatario: '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b',
    monto_base: '250000000'
  }))

  assert.equal(r.decision, 'ALLOW')
  assert.ok(Array.isArray(r.traza) && r.traza.length > 0)
})

test('cerrojo_politicas describe los topes sin filtrar un solo secreto', async () => {
  const r = JSON.parse(await llamar('cerrojo_politicas'))

  assert.equal(r.red, 'sepolia')
  assert.equal(r.politicas.length, 5)
  assert.ok(!JSON.stringify(r).match(/seed|mnemonic|private/i))
})
