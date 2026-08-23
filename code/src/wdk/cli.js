import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { RAIZ } from '../config.js'
import { CerrojoError } from '../errors.js'

/**
 * Adaptador sobre @tetherto/wdk-cli.
 *
 * Existe para una sola cosa: demostrar que la CLI oficial de WDK y el motor de
 * politicas de Cerrojo son la misma billetera, y que la CLI sola no tiene tope
 * ni allowlist. Por eso este modulo:
 *
 *   1. **nunca** construye un send sin `--dry-run` — la bandera esta hardcodeada
 *      en construirArgsSend() y no hay parametro que la quite, y
 *   2. solo recibe lineas que el cerrojo ya aprobo, salvo que se le pida
 *      explicitamente lo contrario para la demostracion de la §4.
 *
 * La seed no pasa por aqui: la CLI la tiene en su propio llavero cifrado, y el
 * passphrase llega por WDK_PASSPHRASE, que nunca se imprime.
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
 * Arma los argumentos de `wdk send`.
 *
 * `--dry-run` no es un parametro: es parte de la definicion. Un test lo afirma
 * sobre cada combinacion de entradas, para que nadie lo vuelva opcional.
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

/** Corre la CLI y devuelve su JSON. Nunca lanza por un exit != 0: eso es un dato. */
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
      // La CLI mezcla avisos con el JSON; se toma el ultimo objeto que parsee.
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

/** Direccion que deriva la CLI para esta red. La comparacion con el SDK es la prueba de paridad. */
export async function direccionCli ({ network }) {
  const r = await correrWdk(construirArgsDireccion({ network }))
  if (r.json?.code === 'WALLET_NOT_UNLOCKED') throw errWalletBloqueada(process.env.CERROJO_WDKCLI_WALLET ?? 'default')
  return { direccion: r.json?.address ?? null, crudo: r.crudo, codigo: r.codigo }
}

/**
 * Pasa UNA linea a la CLI en dry-run.
 *
 * Devuelve el veredicto de la CLI tal cual, incluido el error: que la CLI no
 * refuse una linea que el cerrojo si refuso es exactamente lo que se quiere ver.
 */
export async function dryRunLinea ({ network, token, to, amount }) {
  const args = construirArgsSend({ network, token, to, amount })
  const r = await correrWdk(args)

  return {
    args: args.join(' '),
    ok: r.codigo === 0 && !r.json?.error,
    // La CLI no distingue "denegado por politica" de "reverso en la cadena":
    // no tiene politicas. Se guarda el codigo para leerlo en el reporte.
    errorCode: r.json?.code ?? null,
    error: r.json?.error ?? null,
    resultado: r.json?.error ? null : r.json,
    crudo: r.crudo.slice(0, 2000)
  }
}
