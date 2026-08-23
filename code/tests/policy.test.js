// tests/policy.test.js
//
// The lock on its own, with the RPC pointed at a dead port. If any policy needed
// the network these tests would hang, so the fact that they pass in milliseconds
// is itself the assertion: refusing costs no network, and the engine denies with
// the chain unreachable.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import WDK from '@tetherto/wdk'

import { cargarConfig } from '../src/config.js'
import { LedgerDiario } from '../src/policy/ledger.js'
import { abrirSesion, esViolacionDePolitica } from '../src/wdk/session.js'

// Test seed: minted in memory, never written and never printed.
const SEED = WDK.getRandomSeedPhrase()

// RPC on a dead port: if a policy needed the network, these tests would hang.
const cfg = cargarConfig({
  CERROJO_RPC_URL: 'http://127.0.0.1:9',
  CERROJO_CAP_TX: '500000000',
  CERROJO_CAP_DAY: '1500000000'
})

const ALLOWLIST = [
  '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b',
  '0xB51803A4F24B2776456fEe6c869c95c811247318'
]

async function sesionDePrueba (ledger = new LedgerDiario({ dir: cfg.dirEstado, network: 'test', persistir: false })) {
  return { s: await abrirSesion({ seed: SEED, cfg, ledger, allowlist: ALLOWLIST }), ledger }
}

const transferencia = (over = {}) => ({
  token: cfg.token.address,
  recipient: ALLOWLIST[0],
  amount: 100000000n,
  ...over
})

test('la cuenta viene envuelta en el Proxy de politicas', async () => {
  const { s } = await sesionDePrueba()
  assert.equal(typeof s.cuenta.simulate.transfer, 'function')
  assert.match(s.tesoreria, /^0x[0-9a-fA-F]{40}$/)
  s.cerrar()
})

test('permite una transferencia dentro del tope, a un destinatario de la lista', async () => {
  const { s } = await sesionDePrueba()
  const v = await s.cuenta.simulate.transfer(transferencia())
  assert.equal(v.decision, 'ALLOW')
  s.cerrar()
})

test('cap-por-transferencia deniega una linea sobre el tope, con el RPC muerto', async () => {
  const { s } = await sesionDePrueba()
  const v = await s.cuenta.simulate.transfer(transferencia({ amount: 900000000n }))
  assert.equal(v.decision, 'DENY')
  assert.equal(v.policy_id, 'cap-por-transferencia')
  assert.equal(v.matched_rule, 'denegar-sobre-tope')
  assert.match(v.reason, /tope por transferencia/i)
  s.cerrar()
})

test('allowlist-destinatarios deniega a quien no esta en la lista', async () => {
  const { s } = await sesionDePrueba()
  const v = await s.cuenta.simulate.transfer(transferencia({ recipient: '0x000000000000000000000000000000000000dEaD' }))
  assert.equal(v.decision, 'DENY')
  assert.equal(v.policy_id, 'allowlist-destinatarios')
  s.cerrar()
})

test('solo-token-esperado deniega otro contrato de token', async () => {
  const { s } = await sesionDePrueba()
  const v = await s.cuenta.simulate.transfer(transferencia({ token: '0x1111111111111111111111111111111111111111' }))
  assert.equal(v.decision, 'DENY')
  assert.equal(v.policy_id, 'solo-token-esperado')
  s.cerrar()
})

test('cap-diario deniega cuando el acumulado del dia superaria el tope', async () => {
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: 'test', persistir: false })
  const { s } = await sesionDePrueba(ledger)

  ledger.registrar({ amount: 1400000000n, row: 1, runId: 'test', dryRun: true })

  const v = await s.cuenta.simulate.transfer(transferencia({ amount: 200000000n }))
  assert.equal(v.decision, 'DENY')
  assert.equal(v.policy_id, 'cap-diario')

  const ok = await s.cuenta.simulate.transfer(transferencia({ amount: 50000000n }))
  assert.equal(ok.decision, 'ALLOW')
  s.cerrar()
})

test('default-deny: sendTransaction y approve no tienen regla ALLOW y quedan denegadas', async () => {
  const { s } = await sesionDePrueba()

  const envio = await s.cuenta.simulate.sendTransaction({ to: ALLOWLIST[0], value: 1n })
  assert.equal(envio.decision, 'DENY')

  const aprobacion = await s.cuenta.simulate.approve({ token: cfg.token.address, spender: ALLOWLIST[0], amount: 10n ** 30n })
  assert.equal(aprobacion.decision, 'DENY')
  s.cerrar()
})

test('ejecutar de verdad una transferencia denegada lanza PolicyViolationError, sin tocar la red', async () => {
  const { s } = await sesionDePrueba()
  await assert.rejects(
    () => s.cuenta.transfer(transferencia({ amount: 900000000n })),
    (err) => {
      assert.ok(esViolacionDePolitica(err))
      assert.equal(err.policyId, 'cap-por-transferencia')
      return true
    }
  )
  s.cerrar()
})
