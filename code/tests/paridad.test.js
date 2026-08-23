// tests/paridad.test.js
//
// Parity with the official CLI, asserted through a fake adapter so the whole
// orchestration can be checked with no network and no keyring. What it counts is
// which lines were handed over: a denied line reaching the CLI would be the one
// result that breaks the argument.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { construirArgsDireccion, construirArgsSend } from '../src/wdk/cli.js'
import { clasificarCli, correrParidad, paridadMarkdown } from '../src/paridad.js'
import { SEED } from './semilla.js'

const CFG = {
  network: 'sepolia',
  token: { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6 }
}

const SDK = '0xD570f7170e5C4429e3a86dfFf34651E3eD7f754e'
const A = '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b'
const B = '0x17d5D5fC28ee6240e1129CCBf386458071b056F9'
const MUERTA = '0x000000000000000000000000000000000000dEaD'

const recibo = {
  lines: [
    { row: 1, estado: 'ejecutada', to: A, amount: '250000000' },
    { row: 4, estado: 'denegada', to: B, amount: '900000000', policy: { rule: 'denegar-sobre-tope', reason: 'supera el tope' } },
    { row: 7, estado: 'no_intentada', to: null, amount: null },
    { row: 8, estado: 'denegada', to: MUERTA, amount: '400000000', policy: { rule: 'denegar-fuera-de-lista', reason: 'fuera de lista' } }
  ]
}

/** A fake adapter: records which lines were handed over. No network, no keyring. */
function adaptadorFalso ({ direccion = SDK } = {}) {
  const entregadas = []
  return {
    entregadas,
    async direccionCli () { return { direccion, crudo: '', codigo: 0 } },
    async dryRunLinea ({ to, amount }) {
      entregadas.push({ to, amount })
      return { args: `send --to ${to}`, ok: true, errorCode: null, error: null, resultado: { fee: '1' }, crudo: '' }
    }
  }
}

describe('construirArgsSend', () => {
  test('siempre lleva --dry-run, pase lo que pase', () => {
    const combinaciones = [
      { network: 'sepolia', token: 'usdt', to: A, amount: '1' },
      { network: 'sepolia', token: null, to: MUERTA, amount: '999999999999' },
      { network: 'ethereum', token: 'USDT', to: B, amount: '0' }
    ]
    for (const c of combinaciones) {
      const args = construirArgsSend(c)
      assert.ok(args.includes('--dry-run'), `sin --dry-run: ${args.join(' ')}`)
      assert.ok(args.includes('--json'))
      assert.ok(args.includes('--base-units'))
    }
  })

  test('no hay parametro que quite --dry-run', () => {
    // Hostile flags are passed in; the function ignores them because it never reads them.
    const args = construirArgsSend({ network: 'sepolia', token: 'usdt', to: A, amount: '1', dryRun: false, live: true, confirmo: true })
    assert.ok(args.includes('--dry-run'))
    assert.ok(!args.includes('--live'))
  })

  test('el token viaja en minusculas, como lo pide el registro de la CLI', () => {
    assert.ok(construirArgsSend({ network: 'sepolia', token: 'USDT', to: A, amount: '1' }).includes('usdt'))
  })

  test('rechaza lo que no es una direccion EVM', () => {
    for (const to of ['0x17d5D5fC28ee', '', null, 'ana@example.com', A.slice(0, -1)]) {
      assert.throws(() => construirArgsSend({ network: 'sepolia', to, amount: '1' }), TypeError)
    }
  })

  test('rechaza montos que no son enteros en unidades base', () => {
    for (const amount of ['250.00', '', null, '-1', '1e6', '120,50']) {
      assert.throws(() => construirArgsSend({ network: 'sepolia', to: A, amount }), TypeError)
    }
  })

  test('construirArgsDireccion no manda nada al nodo mas que una consulta', () => {
    const args = construirArgsDireccion({ network: 'sepolia' })
    assert.deepEqual(args, ['get', 'address', '--network', 'sepolia', '--json'])
    assert.ok(!args.includes('send'))
  })
})

describe('correrParidad', () => {
  test('solo las lineas ejecutadas llegan a la CLI', async () => {
    const falso = adaptadorFalso()
    const p = await correrParidad({ cfg: CFG, recibo, direccionSdk: SDK, adaptador: falso })

    assert.equal(falso.entregadas.length, 1)
    assert.equal(falso.entregadas[0].to, A)
    assert.equal(p.totales.entregadas, 1)
    assert.equal(p.totales.retenidas, 3)
  })

  test('ninguna linea denegada aparece entregada', async () => {
    const p = await correrParidad({ cfg: CFG, recibo, direccionSdk: SDK, adaptador: adaptadorFalso() })
    for (const l of p.lineas.filter((x) => x.estado !== 'ejecutada')) {
      assert.equal(l.entregadaALaCli, false)
      assert.ok(l.motivo)
    }
  })

  test('la direccion se compara sin importar el checksum', async () => {
    const p = await correrParidad({
      cfg: CFG,
      recibo,
      direccionSdk: SDK,
      adaptador: adaptadorFalso({ direccion: SDK.toLowerCase() })
    })
    assert.equal(p.billetera.coinciden, true)
    assert.equal(p.cuadra, true)
  })

  test('otra billetera rompe la paridad', async () => {
    const p = await correrParidad({
      cfg: CFG,
      recibo,
      direccionSdk: SDK,
      adaptador: adaptadorFalso({ direccion: MUERTA })
    })
    assert.equal(p.billetera.coinciden, false)
    assert.equal(p.cuadra, false)
  })

  test('sin --demostrar-fuga no se entrega ninguna denegada, ni para demostrar', async () => {
    const falso = adaptadorFalso()
    const p = await correrParidad({ cfg: CFG, recibo, direccionSdk: SDK, adaptador: falso })
    assert.equal(p.fuga, null)
    assert.ok(!falso.entregadas.some((e) => e.to === MUERTA || e.to === B))
  })

  test('con --demostrar-fuga se entrega una denegada, y se marca como demostracion', async () => {
    const falso = adaptadorFalso()
    const p = await correrParidad({ cfg: CFG, recibo, direccionSdk: SDK, adaptador: falso, demostrarFuga: true })
    assert.equal(p.fuga.row, 4)
    assert.equal(p.fuga.cliLaRefusoPorPolitica, false)
    assert.equal(p.fuga.reglaDelCerrojo, 'denegar-sobre-tope')
    // Still dry-run: the demonstration sends nothing.
    assert.ok(falso.entregadas.some((e) => e.to === B))
  })

  test('el markdown nombra las dos superficies y no filtra la seed', async () => {
    const p = await correrParidad({ cfg: CFG, recibo, direccionSdk: SDK, adaptador: adaptadorFalso(), demostrarFuga: true })
    const md = paridadMarkdown(p)
    assert.match(md, /@tetherto\/wdk-cli/)
    assert.match(md, /@tetherto\/wdk/)
    assert.match(md, /Coinciden byte a byte/)
    // What is conclusive is not the word "seed", which appears in the prose: it is
    // the *sequence*. Four consecutive seed words do not land together by chance.
    const palabras = SEED.split(/\s+/)
    for (let k = 0; k + 4 <= palabras.length; k++) {
      assert.ok(!md.includes(palabras.slice(k, k + 4).join(' ')), 'aparece una secuencia de la seed')
    }
  })
})

describe('clasificarCli', () => {
  test('un reverso por saldo no se cuenta como una denegacion por politica', () => {
    const c = clasificarCli({ ok: false, errorCode: 'CALL_EXCEPTION', error: 'execution reverted: "ERC20: transfer amount exceeds balance"' })
    assert.equal(c.clase, 'reverso-por-saldo')
    assert.match(c.etiqueta, /no es una politica/)
  })

  test('cualquier otro error de la CLI tampoco es una politica', () => {
    const c = clasificarCli({ ok: false, errorCode: 'NETWORK_ERROR', error: 'timeout' })
    assert.equal(c.clase, 'error-de-cadena')
    assert.match(c.etiqueta, /no de una politica/)
  })

  test('una linea aceptada se lee como aceptada', () => {
    assert.equal(clasificarCli({ ok: true }).clase, 'aceptada')
  })

  test('ninguna etiqueta le atribuye a la CLI un tope que no tiene', () => {
    for (const cli of [{ ok: false, errorCode: 'CALL_EXCEPTION', error: 'exceeds balance' }, { ok: false, errorCode: 'X', error: 'y' }, { ok: true }]) {
      assert.ok(!/denegad|tope|allowlist/i.test(clasificarCli(cli).etiqueta))
    }
  })
})
