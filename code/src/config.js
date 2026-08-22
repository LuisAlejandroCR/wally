import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { E } from './errors.js'

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Node >= 20.6 trae loadEnvFile. Sin .env el proceso sigue con los valores por defecto.
try {
  const env = resolve(RAIZ, '.env')
  if (existsSync(env)) process.loadEnvFile(env)
} catch { /* sin .env: se usan defaults y variables del entorno */ }

function ruta (valor, porDefecto) {
  const v = valor ?? porDefecto
  return isAbsolute(v) ? v : resolve(RAIZ, v)
}

function entero (valor, porDefecto) {
  const v = valor ?? porDefecto
  const n = BigInt(String(v).trim())
  if (n < 0n) throw new Error(`Un tope no puede ser negativo: ${v}`)
  return n
}

/**
 * Lee la configuracion del entorno. No toca la red ni la seed.
 * La seed se pide aparte, con leerSeed(), para que ningun objeto de config la lleve dentro.
 */
export function cargarConfig (overrides = {}) {
  const env = { ...process.env, ...overrides }

  const cfg = {
    network: env.CERROJO_NETWORK ?? 'sepolia',
    rpcUrl: env.CERROJO_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
    token: {
      symbol: env.CERROJO_TOKEN_SYMBOL ?? 'USDT',
      address: env.CERROJO_TOKEN_ADDRESS ?? '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
      decimals: Number(env.CERROJO_TOKEN_DECIMALS ?? 6)
    },
    capTx: entero(env.CERROJO_CAP_TX, '500000000'),
    capDay: entero(env.CERROJO_CAP_DAY, '1500000000'),
    allowlistPath: ruta(env.CERROJO_ALLOWLIST, './data/allowlist.txt'),
    demo: {
      network: env.CERROJO_DEMO_NETWORK ?? 'polygon',
      rpcUrl: env.CERROJO_DEMO_RPC_URL ?? 'https://polygon-bor-rpc.publicnode.com',
      readOnly: (env.CERROJO_DEMO_READONLY ?? 'true') !== 'false'
    },
    planner: {
      modo: env.CERROJO_PLANNER ?? 'rules',
      modelo: env.CERROJO_PLANNER_MODEL ?? 'claude-opus-5',
      apiKey: env.ANTHROPIC_API_KEY ?? null
    },
    evalRuns: Number(env.CERROJO_EVAL_RUNS ?? 5),
    dirRuns: ruta(env.CERROJO_RUNS_DIR, './runs'),
    dirEstado: ruta(env.CERROJO_STATE_DIR, './state')
  }

  return cfg
}

/** La seed vive en una variable y no entra a ningun objeto que se serialice. */
export function leerSeed (env = process.env) {
  const seed = env.CERROJO_SEED
  if (!seed || !seed.trim()) throw E.seedAusente()
  return seed.trim()
}

export function cargarAllowlist (rutaArchivo) {
  if (!existsSync(rutaArchivo)) throw E.allowlistAusente(rutaArchivo)
  return readFileSync(rutaArchivo, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}
