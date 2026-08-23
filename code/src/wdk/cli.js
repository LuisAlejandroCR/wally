// src/wdk/cli.js
//
// A thin adapter over @tetherto/wdk-cli. It exists to prove one thing: that
// Tether's own CLI and Cerrojo's policy engine derive the same wallet, and that
// the CLI on its own carries no cap and no allowlist. Every send it builds is
// hard-wired to --dry-run, and the seed never passes through here.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { RAIZ } from '../config.js'
import { CerrojoError } from '../errors.js'

/**
 * Two rules this module keeps:
 *
 *   1. it **never** builds a send without `--dry-run` — the flag is hard-coded in
 *      construirArgsSend() and no parameter removes it, and
 *   2. it only receives lines the lock already approved, unless asked explicitly
 *      otherwise for the demonstration in §4.
 *
 * The seed does not pass through here: the CLI keeps it in its own encrypted
 * keyring, and the passphrase arrives via WDK_PASSPHRASE, which is never printed.
 */

export const RUTA_WDK = resolve(RAIZ, 'node_modules/@tetherto/wdk-cli/bin/wdk.mjs')

const TIMEOUT_MS = 90_000

export function cliDisponible () {
  return existsSync(RUTA_WDK)
}

export const errCliAusente = () => new CerrojoError(
  'E_WDKCLI_MISSING',
  `No se encontro la CLI de WDK en ${RUTA_WDK}`,
  'Instalala con: npm install @tetherto/wdk-cli',
  'wdk-cli'
)

export const errWalletBloqueada = (wallet) => new CerrojoError(
  'E_WDKCLI_LOCKED',
  `La billetera '${wallet}' de la CLI de WDK esta bloqueada o no existe.`,
  `Importala y abrila: WDK_PASSPHRASE=... node node_modules/@tetherto/wdk-cli/bin/wdk.mjs wallet import --name ${wallet} --seed-stdin < seed.txt && ... wallet unlock --name ${wallet}`,
  'wdk-cli'
)

/**
 * Builds the arguments for `wdk send`.
 *
 * `--dry-run` is not a parameter: it is part of the definition. A test asserts it
 * over every combination of inputs, so that nobody can make it optional.
 */
export function construirArgsSend ({ network, token, to, amount }) {
  if (!network) throw new TypeError('construirArgsSend: falta network')
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(to ?? ''))) {
    throw new TypeError(`construirArgsSend: destinatario no es una direccion EVM: ${to}`)
  }
  if (!/^\d+$/.test(String(amount ?? ''))) {
    throw new TypeError(`construirArgsSend: el monto debe ser un entero en unidades base: ${amount}`)
  }

  const args = ['send', '--network', network, '--to', to, '--amount', String(amount), '--base-units']
  if (token) args.push('--token', String(token).toLowerCase())
  args.push('--dry-run', '--json')
  return args
}

export function construirArgsDireccion ({ network }) {
  return ['get', 'address', '--network', network, '--json']
}

/** Runs the CLI and returns its JSON. A non-zero exit never throws: it is data. */
export async function correrWdk (args, { timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  if (!cliDisponible()) throw errCliAusente()

  return await new Promise((resolver) => {
    const hijo = spawn(process.execPath, [RUTA_WDK, ...args], {
      cwd: RAIZ,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let salida = ''
    let error = ''
    const temporizador = setTimeout(() => hijo.kill('SIGKILL'), timeoutMs)

    hijo.stdout.on('data', (d) => { salida += d })
    hijo.stderr.on('data', (d) => { error += d })

    hijo.on('close', (codigo) => {
      clearTimeout(temporizador)
      const crudo = (salida + error).trim()
      let json = null
      // The CLI mixes warnings into the JSON; take the last object that parses.
      for (const linea of crudo.split('\n').reverse()) {
        const t = linea.trim()
        if (!t.startsWith('{')) continue
        try { json = JSON.parse(t); break } catch { /* no era JSON: seguir */ }
      }
      resolver({ codigo, json, crudo, args })
    })

    hijo.on('error', (err) => {
      clearTimeout(temporizador)
      resolver({ codigo: -1, json: null, crudo: err.message, args })
    })
  })
}

/** The address the CLI derives for this network. Comparing it with the SDK is the parity proof. */
export async function direccionCli ({ network }) {
  const r = await correrWdk(construirArgsDireccion({ network }))
  if (r.json?.code === 'WALLET_NOT_UNLOCKED') throw errWalletBloqueada(process.env.CERROJO_WDKCLI_WALLET ?? 'default')
  return { direccion: r.json?.address ?? null, crudo: r.crudo, codigo: r.codigo }
}

/**
 * Hands ONE line to the CLI in dry-run.
 *
 * It returns the CLI's verdict untouched, error included: the CLI failing to
 * refuse a line the lock did refuse is exactly what we want on screen.
 */
export async function dryRunLinea ({ network, token, to, amount }) {
  const args = construirArgsSend({ network, token, to, amount })
  const r = await correrWdk(args)

  return {
    args: args.join(' '),
    ok: r.codigo === 0 && !r.json?.error,
    // The CLI cannot tell "denied by policy" from "reverted on chain": it has no
    // policies. The code is kept so the report can show it.
    errorCode: r.json?.code ?? null,
    error: r.json?.error ?? null,
    resultado: r.json?.error ? null : r.json,
    crudo: r.crudo.slice(0, 2000)
  }
}
