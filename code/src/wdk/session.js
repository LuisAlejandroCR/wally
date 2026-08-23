// src/wdk/session.js
//
// Opens a WDK session with the policies already registered, which is the only
// way the rest of the codebase is allowed to get an account. The seed arrives as
// an argument, is used to build the instance, and is never stored on anything
// that gets serialised or printed.

import WDK, { PolicyViolationError, PolicyConfigurationError } from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { construirPoliticas, politicaSoloLectura } from '../policy/index.js'
import { E } from '../errors.js'

export { PolicyViolationError, PolicyConfigurationError }

/**
 * Registering the policies before handing back an account is what makes the
 * write path unreachable without them.
 */
export async function abrirSesion ({ seed, cfg, ledger, allowlist, conDemo = false }) {
  if (!WDK.isValidSeed(seed)) throw E.seedInvalida()

  const wdk = new WDK(seed)

  wdk.registerWallet(cfg.network, WalletManagerEvm, { provider: cfg.rpcUrl })

  const politicas = construirPoliticas({
    wallet: cfg.network,
    capTx: cfg.capTx,
    capDay: cfg.capDay,
    allowlist,
    token: cfg.token,
    ledger
  })

  if (conDemo) {
    wdk.registerWallet(cfg.demo.network, WalletManagerEvm, { provider: cfg.demo.rpcUrl })
    politicas.push(politicaSoloLectura({ wallet: cfg.demo.network }))
  }

  wdk.registerPolicy(politicas)

  // A policy Proxy: any denied write throws PolicyViolationError.
  const cuenta = await wdk.getAccount(cfg.network, 0)
  const tesoreria = await cuenta.getAddress()

  // A read-only copy of the same account: quotes a fee without exposing a write.
  const cuentaSoloLectura = await cuenta.toReadOnlyAccount()

  let demo = null
  if (conDemo) {
    // The structural lock: on this object the send method does not exist.
    const plena = await wdk.getAccount(cfg.demo.network, 0)
    demo = { cuenta: await plena.toReadOnlyAccount(), cuentaPlena: plena, network: cfg.demo.network }
  }

  return {
    wdk,
    cuenta,
    cuentaSoloLectura,
    tesoreria,
    demo,
    politicas: politicas.map((p) => ({ id: p.id, name: p.name, scope: p.scope, wallet: p.wallet })),
    cerrar: () => wdk.dispose()
  }
}

export function esViolacionDePolitica (err) {
  return err instanceof PolicyViolationError
}
