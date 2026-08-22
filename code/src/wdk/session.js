import WDK, { PolicyViolationError, PolicyConfigurationError } from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { construirPoliticas, politicaSoloLectura } from '../policy/index.js'
import { E } from '../errors.js'

export { PolicyViolationError, PolicyConfigurationError }

/**
 * Abre una sesion de WDK con las politicas ya puestas.
 *
 * La seed entra por argumento, se usa para construir la instancia y no se guarda
 * en ningun objeto que se serialice ni se imprima.
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

  // Proxy con politicas: cualquier escritura denegada lanza PolicyViolationError.
  const cuenta = await wdk.getAccount(cfg.network, 0)
  const tesoreria = await cuenta.getAddress()

  // Copia de solo lectura de la misma cuenta: sirve para cotizar sin exponer escrituras.
  const cuentaSoloLectura = await cuenta.toReadOnlyAccount()

  let demo = null
  if (conDemo) {
    // Cerrojo estructural: en este objeto el metodo de enviar no existe.
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
