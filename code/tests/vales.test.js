// tests/vales.test.js
//
// The human step, tested as a property rather than as a happy path. What these
// tests defend is the asymmetry: an agent may propose and may not approve.
// Everything else here exists so that approving never becomes a blank cheque —
// the order is frozen, policy decides again at execution, and a voucher lapses.

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import WDK from '@tetherto/wdk'

import { cargarConfig } from '../src/config.js'
import { LedgerDiario } from '../src/policy/ledger.js'
import { abrirSesion } from '../src/wdk/session.js'
import { ejecutarVale } from '../src/execute/index.js'
import { Vales, huellaDeOrden } from '../src/vales.js'

const ALLOW = { decision: 'ALLOW', policy_id: null, matched_rule: null, reason: null }
const PERMITIDO = '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b'
const FUERA_DE_LISTA = '0x000000000000000000000000000000000000dEaD'

function dirTemporal () {
  return mkdtempSync(join(tmpdir(), 'cerrojo-vales-'))
}

function valesEn (dir, ahora) {
  return new Vales({ dir, ...(ahora ? { ahora } : {}) })
}

const TOKEN = { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6 }

const ordenDe = (recipient, amount) => ({ recipient, amount })

test('no se crea un vale para una orden que la politica denego', () => {
  const vales = valesEn(dirTemporal())
  assert.throws(
    () => vales.crear({
      orden: ordenDe(FUERA_DE_LISTA, '400000000'),
      veredicto: { decision: 'DENY', reason: 'fuera de lista' },
      network: 'sepolia',
      token: TOKEN
    }),
    /denego/
  )
})

test('un vale nace propuesto, nunca aprobado', () => {
  const vales = valesEn(dirTemporal())
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })

  assert.equal(v.estado, 'propuesto')
  assert.equal(v.aprobadoPor, null)
  assert.equal(vales.verificar(v.id).ok, false, 'un vale sin aprobar no es ejecutable')
})

test('un vale no lleva nada derivado de la seed', () => {
  const vales = valesEn(dirTemporal())
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })

  assert.ok(!JSON.stringify(v).match(/seed|mnemonic|private|xprv/i))
})

test('editar la orden de un vale ya aprobado rompe su huella', () => {
  const dir = dirTemporal()
  const vales = valesEn(dir)
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })
  vales.aprobar(v.id)
  assert.equal(vales.verificar(v.id).ok, true)

  // Someone with disk access raises the amount after the approval.
  const archivo = join(dir, 'vales', `${v.id}.json`)
  const crudo = JSON.parse(readFileSync(archivo, 'utf8'))
  crudo.orden.amount = '900000000'
  writeFileSync(archivo, JSON.stringify(crudo))

  const r = vales.verificar(v.id)
  assert.equal(r.ok, false)
  assert.match(r.razon, /huella/)
})

test('la huella cambia si cambia cualquier parte de la orden', () => {
  const base = { network: 'sepolia', token: TOKEN.address, recipient: PERMITIDO, amount: '250000000' }
  const h = huellaDeOrden(base)

  assert.notEqual(h, huellaDeOrden({ ...base, amount: '250000001' }))
  assert.notEqual(h, huellaDeOrden({ ...base, recipient: FUERA_DE_LISTA }))
  assert.notEqual(h, huellaDeOrden({ ...base, network: 'polygon' }))
  assert.equal(h, huellaDeOrden({ ...base, recipient: PERMITIDO.toUpperCase() }), 'la direccion no distingue mayusculas')
})

test('un vale vencido no se puede aprobar', () => {
  let t = new Date('2026-08-23T10:00:00Z')
  const vales = valesEn(dirTemporal(), () => t)
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })

  t = new Date('2026-08-23T10:16:00Z') // default validity: 15 minutes
  assert.equal(vales.leer(v.id).estado, 'expirado')
  assert.throws(() => vales.aprobar(v.id), /expirado/)
})

test('un vale se aprueba una sola vez', () => {
  const vales = valesEn(dirTemporal())
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })

  vales.aprobar(v.id)
  assert.throws(() => vales.aprobar(v.id), /aprobado/)
})

test('rechazar cierra el vale sin ejecutar nada', () => {
  const vales = valesEn(dirTemporal())
  const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto: ALLOW, network: 'sepolia', token: TOKEN })

  const cerrado = vales.rechazar(v.id, { motivo: 'no reconozco al destinatario' })
  assert.equal(cerrado.estado, 'rechazado')
  assert.equal(vales.verificar(v.id).ok, false)
})

/* ── The property that matters: approving does not skip the lock ─────────── */

async function sesionDePrueba ({ dirEstado, capDay }) {
  const cfg = cargarConfig({
    CERROJO_STATE_DIR: dirEstado,
    ...(capDay ? { CERROJO_CAP_DAY: capDay } : {})
  })
  const allowlist = [PERMITIDO]
  const ledger = new LedgerDiario({ dir: cfg.dirEstado, network: cfg.network })
  const sesion = await abrirSesion({ seed: WDK.getRandomSeedPhrase(), cfg, ledger, allowlist })
  return { cfg, ledger, sesion }
}

test('un vale aprobado que ya no cabe en el tope diario se deniega igual', async () => {
  const dir = dirTemporal()
  // Daily cap of 300 USDT: the first payment of 250 fits, a second one will not.
  const { cfg, ledger, sesion } = await sesionDePrueba({ dirEstado: dir, capDay: '300000000' })
  const vales = valesEn(dir)

  try {
    const orden = { token: cfg.token.address, recipient: PERMITIDO, amount: 250000000n }
    const veredicto = await sesion.cuenta.simulate.transfer(orden)
    assert.equal(veredicto.decision, 'ALLOW', 'el primer pago cabe cuando se propone')

    const v = vales.crear({
      orden: ordenDe(PERMITIDO, '250000000'),
      veredicto,
      network: cfg.network,
      token: cfg.token
    })
    vales.aprobar(v.id)

    // Between the proposal and the signature, the day is spent by another route.
    ledger.registrar({ amount: 200000000n, row: 1, runId: 'otra-corrida', dryRun: true })

    const r = await ejecutarVale({ sesion, cfg, ledger, vales, id: v.id, modo: 'dry-run', sinRed: true })

    assert.equal(r.ok, false, 'la aprobacion humana no es un permiso para pasarse del tope')
    assert.equal(r.revalidacion, 'DENY')
    assert.equal(r.vale.estado, 'denegado')
    assert.equal(r.vale.resuelto.policy.id, 'cap-diario')
    assert.ok(r.vale.aprobadoEn, 'queda la constancia de que un humano lo habia aprobado')
  } finally {
    sesion.cerrar()
  }
})

test('un vale aprobado y dentro de las reglas se ejecuta en dry-run y consume el acumulado', async () => {
  const dir = dirTemporal()
  const { cfg, ledger, sesion } = await sesionDePrueba({ dirEstado: dir })
  const vales = valesEn(dir)

  try {
    const orden = { token: cfg.token.address, recipient: PERMITIDO, amount: 250000000n }
    const veredicto = await sesion.cuenta.simulate.transfer(orden)

    const v = vales.crear({ orden: ordenDe(PERMITIDO, '250000000'), veredicto, network: cfg.network, token: cfg.token })
    vales.aprobar(v.id)

    const r = await ejecutarVale({ sesion, cfg, ledger, vales, id: v.id, modo: 'dry-run', sinRed: true })

    assert.equal(r.ok, true)
    assert.equal(r.revalidacion, 'ALLOW')
    assert.equal(r.vale.estado, 'ejecutado')
    assert.equal(r.vale.resuelto.modo, 'dry-run')
    assert.equal(r.vale.resuelto.txHash, null, 'un dry-run no produce hash')
    assert.equal(ledger.gastado, 250000000n)

    // Single use: the second attempt no longer finds an approved voucher.
    const otra = await ejecutarVale({ sesion, cfg, ledger, vales, id: v.id, modo: 'dry-run', sinRed: true })
    assert.equal(otra.ok, false)
    assert.match(otra.razon, /ejecutado/)
    assert.equal(ledger.gastado, 250000000n, 'un vale gastado no vuelve a tocar el acumulado')
  } finally {
    sesion.cerrar()
  }
})

test('un vale por encima del tope por transferencia no llega a existir', async () => {
  const dir = dirTemporal()
  const { cfg, sesion } = await sesionDePrueba({ dirEstado: dir })

  try {
    const veredicto = await sesion.cuenta.simulate.transfer({
      token: cfg.token.address,
      recipient: PERMITIDO,
      amount: 900000000n
    })
    assert.equal(veredicto.decision, 'DENY')
    assert.equal(veredicto.policy_id, 'cap-por-transferencia')
  } finally {
    sesion.cerrar()
  }
})
