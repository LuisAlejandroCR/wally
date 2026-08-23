import { join } from 'node:path'

import WDK from '@tetherto/wdk'

import { RAIZ } from '../src/config.js'

/**
 * Seed de testnet para los tests que cruzan un proceso.
 *
 * `policy.test.js` y `recibo.test.js` ya generan la suya en memoria. Los tests que arrancan
 * el CLI, el servidor MCP o la API no pueden: leen `CERROJO_SEED` del entorno, asi que hasta
 * ahora dependian de que la maquina tuviera un `code/.env`. En una clonada limpia eso deja
 * cinco tests en rojo, y el carril pide `npm test` en verde entero antes de cada commit.
 *
 * Se genera en memoria, muere con el proceso de test, no se escribe y no toca ni un fondo:
 * ninguno de estos tests envia — la API no tiene endpoint de envio y el CLI corre `--sin-red`.
 */
export const SEED = WDK.getRandomSeedPhrase()

/**
 * Entorno de un test que arranca un proceso: seed efimera y estado del dia aparte, para que
 * el test no dependa de cuanto se gasto hoy en las demos ni lo ensucie.
 */
export function entorno (nombreEstado) {
  return {
    ...process.env,
    CERROJO_SEED: SEED,
    CERROJO_STATE_DIR: join(RAIZ, 'state', nombreEstado)
  }
}
