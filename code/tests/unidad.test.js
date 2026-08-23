import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { PROBLEMAS, formatearMonto, normalizarMonto } from '../src/ingest/amount.js'
import { parsearCSV } from '../src/ingest/csv.js'
import { LedgerDiario, hoyUTC } from '../src/policy/ledger.js'
import { construirPoliticas, politicaSoloLectura } from '../src/policy/index.js'
import { correrChequeos } from '../src/receipt/checks.js'
import { reciboDeFallo } from '../src/receipt/build.js'
import { reciboMarkdown } from '../src/receipt/markdown.js'
import { validarPlan } from '../src/plan/schema.js'
import { compararDeriva } from '../src/eval/inyeccion.js'
import { E } from '../src/errors.js'
import { nuevoRunId } from '../src/run.js'

/**
 * Tests unitarios: una funcion pura por vez, sin red, sin WDK, sin disco salvo
 * donde el objeto bajo prueba es el que escribe (el ledger).
 *
 * Las pruebas de comportamiento del sistema estan en los otros archivos. Aqui se
 * fija el contrato de cada pieza por separado, que es lo que permite cambiarlas.
 */

describe('normalizarMonto', () => {
  const casos = [
    ['250.00', 6, 250000000n, 'decimal con punto'],
    ['120,50', 6, 120500000n, 'decimal con coma, formato es-CO'],
    ['1.234,56', 6, 1234560000n, 'miles con punto y decimal con coma'],
    ['1,234.56', 6, 1234560000n, 'miles con coma y decimal con punto'],
    ['   120.00   ', 6, 120000000n, 'espacios alrededor'],
    ['0.000001', 6, 1n, 'la unidad base mas pequena'],
    ['1', 6, 1000000n, 'entero sin parte decimal'],
    ['1', 0, 1n, 'token sin decimales'],
    ['999999999999', 6, 999999999999000000n, 'monto enorme, sin perder precision']
  ]

  for (const [texto, decimals, esperado, nota] of casos) {
    test(`acepta ${JSON.stringify(texto)} con ${decimals} decimales — ${nota}`, () => {
      const r = normalizarMonto(texto, decimals)
      assert.equal(r.ok, true, `rechazado: ${r.why}`)
      assert.equal(r.base, esperado)
      assert.equal(typeof r.base, 'bigint')
    })
  }

  const rechazos = [
    ['', PROBLEMAS.MONTO_VACIO, 'vacio'],
    ['   ', PROBLEMAS.MONTO_VACIO, 'solo espacios'],
    [null, PROBLEMAS.MONTO_VACIO, 'null'],
    [undefined, PROBLEMAS.MONTO_VACIO, 'undefined'],
    ['-50.00', PROBLEMAS.MONTO_ILEGIBLE, 'negativo'],
    ['abc', PROBLEMAS.MONTO_ILEGIBLE, 'texto'],
    ['1e6', PROBLEMAS.MONTO_ILEGIBLE, 'notacion cientifica'],
    ['0x10', PROBLEMAS.MONTO_ILEGIBLE, 'hexadecimal'],
    ['(120.00)', PROBLEMAS.MONTO_ILEGIBLE, 'parentesis contables'],
    ['0.00', PROBLEMAS.MONTO_NO_POSITIVO, 'cero'],
    ['10.1234567', PROBLEMAS.MONTO_PRECISION, 'mas decimales que el token']
  ]

  for (const [texto, codigo, nota] of rechazos) {
    test(`rechaza ${JSON.stringify(texto)} como ${codigo} — ${nota}`, () => {
      const r = normalizarMonto(texto, 6)
      assert.equal(r.ok, false)
      assert.equal(r.codigo, codigo)
      assert.ok(r.why.length > 10, 'toda negativa lleva una razon legible')
    })
  }

  test('nunca redondea: prefiere abstenerse a perder un centavo', () => {
    assert.equal(normalizarMonto('1.005', 2).ok, false)
    assert.equal(normalizarMonto('1.00', 2).base, 100n)
  })
})

describe('formatearMonto', () => {
  test('es la inversa de normalizarMonto para los montos que acepta', () => {
    for (const texto of ['250.00', '0.000001', '1234.567890', '999999.999999']) {
      const base = normalizarMonto(texto, 6).base
      assert.equal(formatearMonto(base, 6), Number(texto).toFixed(6))
    }
  })

  test('rellena decimales a la izquierda sin perder el cero', () => {
    assert.equal(formatearMonto(1n, 6), '0.000001')
    assert.equal(formatearMonto(1000000n, 6), '1.000000')
  })

  test('con 0 decimales no inventa un punto', () => {
    assert.equal(formatearMonto(42n, 0), '42')
  })

  test('acepta string o bigint indistintamente', () => {
    assert.equal(formatearMonto('250000000', 6), formatearMonto(250000000n, 6))
  })
})

describe('parsearCSV', () => {
  test('separa campos y filas', () => {
    assert.deepEqual(parsearCSV('a,b\n1,2\n'), [['a', 'b'], ['1', '2']])
  })

  test('respeta las comas dentro de comillas', () => {
    assert.deepEqual(parsearCSV('a,b\n"1,5",2\n'), [['a', 'b'], ['1,5', '2']])
  })

  test('una comilla escapada es una comilla', () => {
    assert.deepEqual(parsearCSV('a\n"di ""hola"""\n'), [['a'], ['di "hola"']])
  })

  test('un salto de linea dentro de comillas no parte la fila', () => {
    assert.deepEqual(parsearCSV('a,b\n"dos\nlineas",x\n'), [['a', 'b'], ['dos\nlineas', 'x']])
  })

  test('descarta filas completamente vacias', () => {
    assert.deepEqual(parsearCSV('a,b\n\n\n1,2\n'), [['a', 'b'], ['1', '2']])
  })

  test('la ultima fila sin salto de linea final igual cuenta', () => {
    assert.deepEqual(parsearCSV('a,b\n1,2'), [['a', 'b'], ['1', '2']])
  })

  test('un campo vacio se conserva como cadena vacia, no se pierde', () => {
    assert.deepEqual(parsearCSV('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']])
  })
})

describe('LedgerDiario', () => {
  const conDirTemporal = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'cerrojo-ledger-'))
    try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  test('empieza en cero y proyecta sin mutar', () => {
    const l = new LedgerDiario({ dir: '/no/existe', network: 'test', persistir: false })
    assert.equal(l.gastado, 0n)
    assert.equal(l.proyectado(100n), 100n)
    assert.equal(l.gastado, 0n, 'proyectar no consume')
  })

  test('registrar acumula y deja rastro del movimiento', () => {
    const l = new LedgerDiario({ dir: '/no/existe', network: 'test', persistir: false })
    l.registrar({ amount: 100n, row: 1, runId: 'r1', dryRun: true })
    l.registrar({ amount: 50n, row: 2, runId: 'r1', dryRun: true })

    assert.equal(l.gastado, 150n)
    assert.equal(l.movimientos.length, 2)
    assert.equal(l.movimientos[0].amount, '100', 'los montos se guardan como string')
  })

  test('restante nunca es negativo', () => {
    const l = new LedgerDiario({ dir: '/no/existe', network: 'test', persistir: false })
    l.registrar({ amount: 500n, row: 1, runId: 'r', dryRun: true })
    assert.equal(l.restante(100n), 0n)
    assert.equal(l.restante(800n), 300n)
  })

  test('persiste y relee el acumulado del mismo dia', () => {
    conDirTemporal((dir) => {
      const a = new LedgerDiario({ dir, network: 'sepolia', fecha: '2026-08-22' })
      a.registrar({ amount: 1296000000n, row: 1, runId: 'r1', dryRun: true })

      const b = new LedgerDiario({ dir, network: 'sepolia', fecha: '2026-08-22' })
      assert.equal(b.gastado, 1296000000n, 'la segunda corrida del dia ve lo ya gastado')

      const otroDia = new LedgerDiario({ dir, network: 'sepolia', fecha: '2026-08-23' })
      assert.equal(otroDia.gastado, 0n, 'el tope diario se renueva por fecha')

      const otraRed = new LedgerDiario({ dir, network: 'polygon', fecha: '2026-08-22' })
      assert.equal(otraRed.gastado, 0n, 'cada red lleva su propio acumulado')
    })
  })

  test('un ledger corrupto se lee como cero: el tope queda mas estricto, nunca mas laxo', () => {
    conDirTemporal((dir) => {
      const l = new LedgerDiario({ dir, network: 'sepolia', fecha: '2026-08-22' })
      l.registrar({ amount: 100n, row: 1, runId: 'r', dryRun: true })

      writeFileSync(l.archivo, '{esto no es json')

      const releido = new LedgerDiario({ dir, network: 'sepolia', fecha: '2026-08-22' })
      assert.equal(releido.gastado, 0n)
    })
  })

  test('hoyUTC devuelve la fecha en UTC, no en la zona local', () => {
    assert.equal(hoyUTC(new Date('2026-08-23T02:30:00Z')), '2026-08-23')
    assert.match(hoyUTC(), /^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('construirPoliticas', () => {
  const politicas = construirPoliticas({
    wallet: 'sepolia',
    capTx: 500000000n,
    capDay: 1500000000n,
    allowlist: ['0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b'],
    token: { symbol: 'USDT', address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', decimals: 6 },
    ledger: new LedgerDiario({ dir: '/no/existe', network: 'test', persistir: false })
  })

  test('son cinco, con id unico', () => {
    assert.equal(politicas.length, 5)
    assert.equal(new Set(politicas.map((p) => p.id)).size, 5)
  })

  test('solo una regla permite, y permite unicamente transfer', () => {
    const permisivas = politicas.flatMap((p) => p.rules.filter((r) => r.action === 'ALLOW'))
    assert.equal(permisivas.length, 1)
    assert.equal(permisivas[0].operation, 'transfer')
  })

  test('toda regla DENY declara una razon legible', () => {
    for (const p of politicas) {
      for (const r of p.rules.filter((x) => x.action === 'DENY')) {
        assert.ok(r.reason && r.reason.length > 20, `${p.id}/${r.name} sin razon`)
      }
    }
  })

  test('las condiciones son funciones sincronas y no tocan la red', () => {
    for (const p of politicas) {
      for (const r of p.rules) {
        for (const c of r.conditions) {
          assert.equal(typeof c, 'function')
          assert.ok(!/fetch|http|provider|await/.test(c.toString()), `${p.id}/${r.name} parece tocar la red`)
        }
      }
    }
  })

  test('estan atadas a la wallet que ejecuta, no a todas', () => {
    for (const p of politicas) assert.equal(p.wallet, 'sepolia')
  })

  test('la politica de mainnet deniega toda operacion, con comodin', () => {
    const p = politicaSoloLectura({ wallet: 'polygon' })
    assert.equal(p.rules[0].action, 'DENY')
    assert.equal(p.rules[0].operation, '*')
    assert.equal(p.rules[0].conditions.length, 0, 'sin condiciones: deniega siempre')
  })
})

describe('correrChequeos', () => {
  const allowlist = ['0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b']
  const totales = { lineas: 2, ejecutadas: 1, denegadas: 1, no_intentadas: 0 }

  test('los cuatro chequeos pasan en el caso sano', () => {
    const chequeos = correrChequeos({
      lineas: [
        { row: 1, estado: 'ejecutada', to: allowlist[0], amount: '100' },
        { row: 2, estado: 'denegada', to: '0x000000000000000000000000000000000000dEaD', amount: '200' }
      ],
      totales,
      allowlist
    })

    assert.equal(chequeos.length, 4)
    assert.ok(chequeos.every((c) => c.ok), JSON.stringify(chequeos))
    assert.match(chequeos.find((c) => c.name === 'destinatarios_en_allowlist').detail, /denegada|denegadas/)
  })

  test('suma_cuadra falla cuando los estados no suman el total', () => {
    const chequeos = correrChequeos({ lineas: [], totales: { ...totales, lineas: 3 }, allowlist })
    assert.equal(chequeos.find((c) => c.name === 'suma_cuadra').ok, false)
  })

  test('destinatarios_en_allowlist falla si se ejecuto fuera de la lista', () => {
    const chequeos = correrChequeos({
      lineas: [{ row: 1, estado: 'ejecutada', to: '0x000000000000000000000000000000000000dEaD', amount: '100' }],
      totales: { lineas: 1, ejecutadas: 1, denegadas: 0, no_intentadas: 0 },
      allowlist
    })
    const c = chequeos.find((x) => x.name === 'destinatarios_en_allowlist')
    assert.equal(c.ok, false)
    assert.match(c.detail, /fila|filas/)
  })

  test('sin_duplicados detecta el mismo par destinatario+monto ejecutado dos veces', () => {
    const chequeos = correrChequeos({
      lineas: [
        { row: 1, estado: 'ejecutada', to: allowlist[0], amount: '100' },
        { row: 2, estado: 'ejecutada', to: allowlist[0].toUpperCase(), amount: '100' }
      ],
      totales: { lineas: 2, ejecutadas: 2, denegadas: 0, no_intentadas: 0 },
      allowlist
    })
    assert.equal(chequeos.find((c) => c.name === 'sin_duplicados').ok, false)
  })

  test('montos_enteros falla ante un float', () => {
    const chequeos = correrChequeos({
      lineas: [{ row: 1, estado: 'ejecutada', to: allowlist[0], amount: '100.5' }],
      totales: { lineas: 1, ejecutadas: 1, denegadas: 0, no_intentadas: 0 },
      allowlist
    })
    assert.equal(chequeos.find((c) => c.name === 'montos_enteros').ok, false)
  })
})

describe('reciboDeFallo', () => {
  const cfg = { network: 'sepolia', token: { symbol: 'USDT', decimals: 6, address: '0x0' } }

  test('cuadra igual: todas las lineas quedan como no intentadas', () => {
    const r = reciboDeFallo({ runId: 'run_x', startedAt: 'ahora', modo: 'dry-run', cfg, error: E.rpcCaido('http://x', 'timeout'), totalLineas: 12 })

    assert.equal(r.totals.cuadra, true)
    assert.equal(r.totals.no_intentadas, 12)
    assert.equal(r.totals.ejecutadas, 0)
    assert.equal(r.failure.code, 'E_RPC_UNREACHABLE')
    assert.ok(r.failure.suggestion.length > 10, 'el error trae su arreglo')
  })

  test('acepta un error sin tipar sin lanzar, y lo dice', () => {
    const r = reciboDeFallo({ runId: 'run_x', startedAt: 'ahora', modo: 'dry-run', cfg, error: new Error('algo raro'), totalLineas: 3 })
    assert.equal(r.failure.code, 'E_DESCONOCIDO')
    assert.match(r.failure.message, /algo raro/)
  })

  test('el markdown de un recibo de fallo se renderiza sin lanzar', () => {
    const r = reciboDeFallo({ runId: 'run_x', startedAt: 'ahora', modo: 'dry-run', cfg, error: E.csvIlegible('x.csv', 'no existe'), totalLineas: 0 })
    const md = reciboMarkdown(r)
    assert.match(md, /E_CSV_UNREADABLE/)
    assert.match(md, /La suma cuadra/)
  })
})

describe('validarPlan', () => {
  const planValido = {
    intent: 'pagar_nomina',
    period: '2026-08',
    lines: [{ row: 1, to: '0xC4d2d867961b2791081Bd0B4fAc4e3bEC57a951b', amount: '250000000', decimals: 6, token: 'USDT', network: 'sepolia', reason: 'nomina' }],
    abstentions: []
  }

  test('acepta un plan bien formado', () => {
    assert.equal(validarPlan(planValido).ok, true)
  })

  const invalidos = [
    [{ ...planValido, lines: [{ ...planValido.lines[0], amount: '250.5' }] }, 'monto con decimales'],
    [{ ...planValido, lines: [{ ...planValido.lines[0], amount: -1 }] }, 'monto numerico negativo'],
    [{ ...planValido, lines: [{ ...planValido.lines[0], to: '0x123' }] }, 'direccion truncada'],
    [{ ...planValido, lines: [{ ...planValido.lines[0], row: 0 }] }, 'fila cero'],
    [{ ...planValido, abstentions: [{ row: 1 }] }, 'abstencion sin razon'],
    [{ ...planValido, intent: '' }, 'intencion vacia'],
    [{}, 'objeto vacio'],
    [null, 'null']
  ]

  for (const [plan, nota] of invalidos) {
    test(`rechaza: ${nota}`, () => {
      const r = validarPlan(plan)
      assert.equal(r.ok, false)
      assert.ok(r.errores.length > 0)
    })
  }

  test('nunca lanza, ni con basura', () => {
    for (const basura of [undefined, 42, 'texto', [], () => {}]) {
      assert.doesNotThrow(() => validarPlan(basura))
    }
  })
})

describe('compararDeriva', () => {
  const recibo = (estados) => ({ lines: estados.map((estado, i) => ({ row: i + 1, estado })) })

  test('sin cambios, no hay deriva', () => {
    const d = compararDeriva(recibo(['ejecutada', 'denegada']), recibo(['ejecutada', 'denegada']))
    assert.equal(d.peligrosas.length, 0)
    assert.equal(d.conservadoras.length, 0)
  })

  test('hacia ejecutar es peligroso, en cualquier direccion de origen', () => {
    for (const antes of ['denegada', 'no_intentada']) {
      const d = compararDeriva(recibo([antes]), recibo(['ejecutada']))
      assert.equal(d.peligrosas.length, 1, `${antes} -> ejecutada deberia ser peligroso`)
      assert.deepEqual(d.peligrosas[0], { row: 1, antes, despues: 'ejecutada' })
    }
  })

  test('alejarse de ejecutar es conservador', () => {
    const d = compararDeriva(recibo(['ejecutada']), recibo(['denegada']))
    assert.equal(d.peligrosas.length, 0)
    assert.equal(d.conservadoras.length, 1)
  })

  test('denegada <-> no_intentada es conservador, no peligroso', () => {
    const d = compararDeriva(recibo(['denegada']), recibo(['no_intentada']))
    assert.equal(d.peligrosas.length, 0)
    assert.equal(d.conservadoras.length, 1)
  })

  test('una fila que desaparece no se cuenta como deriva peligrosa', () => {
    const d = compararDeriva(recibo(['ejecutada', 'ejecutada']), { lines: [{ row: 1, estado: 'ejecutada' }] })
    assert.equal(d.peligrosas.length, 0)
  })
})

describe('errores tipados', () => {
  test('cada error lleva codigo, mensaje y arreglo sugerido', () => {
    const errores = [
      E.seedAusente(), E.seedInvalida(), E.csvIlegible('x', 'y'), E.allowlistAusente('x'),
      E.rpcCaido('url', 'detalle'), E.planInvalido('detalle'), E.sumaNoCuadra('detalle'), E.mainnetEscritura()
    ]

    for (const err of errores) {
      assert.match(err.code, /^E_[A-Z_]+$/)
      assert.ok(err.message.length > 10, `${err.code} sin mensaje`)
      assert.ok(err.suggestion.length > 20, `${err.code} sin arreglo sugerido`)
      assert.ok(err.stage, `${err.code} sin etapa`)
      assert.deepEqual(Object.keys(err.toJSON()).sort(), ['code', 'message', 'stage', 'suggestion'])
    }
  })

  test('ningun mensaje de error sugiere apagar una politica', () => {
    for (const crear of Object.values(E)) {
      const err = crear('x', 'y')
      assert.ok(!/desactiv|apag|quita.*(politica|tope)|disable/i.test(err.suggestion), `${err.code}: ${err.suggestion}`)
    }
  })
})

describe('nuevoRunId', () => {
  test('es ordenable alfabeticamente y no trae caracteres ilegales en una ruta', () => {
    const a = nuevoRunId(new Date('2026-08-22T14:03:11.482Z'))
    const b = nuevoRunId(new Date('2026-08-22T15:03:11.482Z'))

    assert.equal(a, 'run_2026-08-22T14-03-11Z')
    assert.ok(a < b, 'el orden alfabetico es el orden cronologico')
    assert.ok(!/[:*?"<>|]/.test(a), 'sirve como nombre de carpeta en Windows')
  })
})
