import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'

import { RAIZ } from '../src/config.js'
import { entorno } from './semilla.js'

const CLI = join(RAIZ, 'src', 'cli.js')

/** Corre el CLI de verdad, sin red y con el estado del dia en un directorio aparte. */
function cerrojo (...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: entorno('tests-cli')
  })
}

test('--live sin --confirmo no corre: sale con codigo 1 y lo dice', () => {
  const r = cerrojo('run', '--live', '--sin-red')

  assert.equal(r.status, 1)
  assert.match(r.stderr, /--live exige tambien --confirmo/)
  assert.doesNotMatch(r.stdout, /ejecutada/)
})

test('run --json devuelve un recibo que parsea y que cuadra', () => {
  const r = cerrojo('run', '--sin-red', '--json', '--reset-dia')

  assert.equal(r.status, 0)

  const recibo = JSON.parse(r.stdout)
  assert.equal(recibo.version, '1')
  assert.equal(recibo.totals.cuadra, true)
  assert.equal(recibo.totals.ejecutadas + recibo.totals.denegadas + recibo.totals.no_intentadas, recibo.totals.lineas)
  assert.ok(recibo.lines.some((l) => l.estado === 'denegada' && l.policy?.id))
})

test('policy no necesita ni red ni seed para listar el cerrojo', () => {
  const r = spawnSync(process.execPath, [CLI, 'policy'], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: { ...entorno('tests-cli'), CERROJO_SEED: '' }
  })

  assert.equal(r.status, 0)
  assert.match(r.stdout, /cap-por-transferencia/)
  assert.match(r.stdout, /allowlist-destinatarios/)
  assert.match(r.stdout, /default-deny/)
})

test('un CSV que no existe sale con codigo 1 y con el arreglo sugerido, no con una traza', () => {
  const r = cerrojo('run', '--sin-red', '--csv', 'no_existe.csv')

  assert.equal(r.status, 1)
  const salida = r.stdout + r.stderr
  assert.match(salida, /E_CSV_UNREADABLE/)
  assert.doesNotMatch(salida, /at .*\.js:\d+/) // ninguna traza de excepcion
})

test('el comando sin argumentos imprime la ayuda y no hace nada', () => {
  const r = cerrojo()

  assert.equal(r.status, 0)
  assert.match(r.stdout, /cerrojo run/)
  assert.match(r.stdout, /--live --confirmo/)
})
