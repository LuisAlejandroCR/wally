import { join } from 'node:path'

import WDK from '@tetherto/wdk'

import { RAIZ } from '../src/config.js'

/**
 * Testnet seed for the tests that cross a process boundary.
 *
 * `policy.test.js` and `recibo.test.js` already mint their own in memory. The tests that
 * start the CLI, the MCP server or the API cannot: they read `CERROJO_SEED` from the
 * environment, so until now they depended on the machine having a `code/.env`. On a clean
 * clone that left five tests red, and the lane requires `npm test` fully green before
 * every commit.
 *
 * Generated in memory, dies with the test process, never written to disk and never touches
 * a single fund: none of these tests send — the API has no send endpoint and the CLI runs
 * with `--sin-red`.
 */
export const SEED = WDK.getRandomSeedPhrase()

/**
 * The environment for a test that spawns a process: the ephemeral seed, plus the day's state
 * in a directory of its own, so the test neither depends on what the demos spent today nor
 * dirties it.
 */
export function entorno (nombreEstado) {
  return {
    ...process.env,
    CERROJO_SEED: SEED,
    CERROJO_STATE_DIR: join(RAIZ, 'state', nombreEstado)
  }
}
