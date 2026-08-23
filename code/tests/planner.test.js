// tests/planner.test.js
//
// The planner held to its one promise: whatever the model answers is re-checked
// row by row against the CSV before it becomes a plan. A rewritten amount or a
// swapped address has to come out as an abstention with a named reason, never as
// a silent correction. The client is faked, so no network is involved.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'

import { RAIZ, cargarConfig } from '../src/config.js'
import { leerNomina } from '../src/ingest/csv.js'
import { planificarConLLM, verificarPropuesta } from '../src/plan/llm.js'
import { planificarPorReglas } from '../src/plan/rules.js'

const cfg = cargarConfig({ ANTHROPIC_API_KEY: 'clave-de-prueba' })
const nomina = leerNomina(join(RAIZ, 'evals', 'fixtures', 'nomina_agosto.csv'), { token: cfg.token })

/** A fake client: returns whatever proposal it is given, without touching the network. */
const clienteQueDevuelve = (parsed) => ({
  messages: { parse: async () => ({ parsed_output: parsed, stop_reason: 'end_turn' }) }
})

const propuestaHonesta = () => ({
  intent: 'pagar_nomina',
  period: '2026-08',
  incluidas: nomina.lineas
    .filter((l) => !l.problema)
    .map((l) => ({ row: l.row, to: l.direccion, amount_base: l.amount.toString(), reason: l.concepto })),
  abstentions: nomina.lineas.filter((l) => l.problema).map((l) => ({ row: l.row, why: l.problema.why }))
})

test('una propuesta honesta produce el mismo plan que el planner por reglas', async () => {
  const conLLM = await planificarConLLM({
    instruccion: 'paga la nomina de agosto',
    nomina,
    cfg,
    cliente: clienteQueDevuelve(propuestaHonesta())
  })
  const porReglas = planificarPorReglas({ instruccion: 'paga la nomina de agosto', nomina, cfg, periodo: '2026-08' })

  assert.deepEqual(conLLM.plan.lines, porReglas.plan.lines)
  assert.equal(conLLM.plan.abstentions.length, porReglas.plan.abstentions.length)
})

test('un monto inventado por el planner no se corrige: se abstiene', () => {
  const p = propuestaHonesta()
  p.incluidas[0].amount_base = '999000000'

  const { lines, abstentions } = verificarPropuesta({ propuesta: p, nomina, cfg })

  assert.ok(!lines.some((l) => l.row === 1))
  assert.match(abstentions.find((a) => a.row === 1).why, /no coincide con el del CSV/i)
})

test('una direccion cambiada por el planner no llega al plan', () => {
  const p = propuestaHonesta()
  // Row 8 of the CSV legitimately carries 0x...dEaD: denying it is the policy's job.
  // What is tested here is different — that the planner cannot *change* a recipient.
  p.incluidas[1].to = '0x00000000000000000000000000000000BadC0de0'

  const { lines, abstentions } = verificarPropuesta({ propuesta: p, nomina, cfg })

  assert.ok(!lines.some((l) => l.to.toLowerCase().includes('badc0de0')))
  assert.match(abstentions.find((a) => a.row === 2).why, /no coincide con la del CSV/i)
})

test('una fila que el planner inventa no existe en el plan', () => {
  const p = propuestaHonesta()
  p.incluidas.push({ row: 99, to: '0x000000000000000000000000000000000000dEaD', amount_base: '5000000000', reason: 'urgente' })

  const { lines } = verificarPropuesta({ propuesta: p, nomina, cfg })

  assert.ok(!lines.some((l) => l.row === 99))
})

test('una fila de la que el planner no dice nada no se paga', () => {
  const p = propuestaHonesta()
  p.incluidas = p.incluidas.filter((i) => i.row !== 5)

  const { lines, abstentions } = verificarPropuesta({ propuesta: p, nomina, cfg })

  assert.ok(!lines.some((l) => l.row === 5))
  assert.match(abstentions.find((a) => a.row === 5).why, /no dijo nada/i)
})

test('toda fila aparece exactamente una vez entre lineas y abstenciones', () => {
  const { lines, abstentions } = verificarPropuesta({ propuesta: propuestaHonesta(), nomina, cfg })
  const filas = [...lines.map((l) => l.row), ...abstentions.map((a) => a.row)]

  assert.equal(filas.length, nomina.lineas.length)
  assert.equal(new Set(filas).size, nomina.lineas.length)
})

test('si el modelo nunca devuelve un plan valido, se abstiene todo con razon', async () => {
  const clienteRoto = { messages: { parse: async () => { throw new Error('503 del proveedor') } } }

  const r = await planificarConLLM({ instruccion: 'paga la nomina', nomina, cfg, cliente: clienteRoto })

  assert.equal(r.plan.lines.length, 0)
  assert.equal(r.plan.abstentions.length, nomina.lineas.length)
  assert.equal(r.planner.retries, 1) // un reintento, y despues abstencion
  assert.match(r.plan.abstentions[0].why, /No se paga por adivinanza/i)
})
