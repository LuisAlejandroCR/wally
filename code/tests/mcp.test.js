import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { RAIZ } from '../src/config.js'
import { entorno } from './semilla.js'

let cliente

before(async () => {
  // Estado diario aparte: el test no puede depender de cuanto se gasto hoy en las demos.
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

  // Ninguna herramienta permite enviar en vivo. Es la propiedad, no un detalle.
  assert.ok(!nombres.some((n) => /enviar|send|firmar|sign|live/i.test(n)))
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
