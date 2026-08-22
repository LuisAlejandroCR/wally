import { formatearMonto } from '../ingest/amount.js'

/**
 * Las politicas de WDK: el cerrojo.
 *
 * Tres propiedades que no se negocian:
 *  1. Las condiciones son funciones puras. Ninguna toca la red.
 *  2. Denegar no cuesta red: se deniega aunque el RPC este muerto.
 *  3. Ninguna politica se desactiva "para probar". Se cambia el caso, no el cerrojo.
 *
 * Semantica del motor (leida de @tetherto/wdk 1.0.0-beta.16): una cuenta con
 * cualquier politica queda en **default-deny** — toda operacion de escritura sin
 * regla ALLOW que la cubra se deniega con reason `no-applicable-rule`. Por eso
 * aqui solo se permite `transfer`: `sendTransaction`, `approve`, `signTypedData`
 * y `delegate` quedan denegadas de fabrica, y con ellas los rodeos clasicos al
 * tope (calldata ERC-20 cruda, Permit, ERC-7702).
 */
export function construirPoliticas ({ wallet, capTx, capDay, allowlist, token, ledger }) {
  const decimales = token.decimals
  const permitidas = new Set(allowlist.map((a) => a.toLowerCase()))
  const tokenEsperado = token.address.toLowerCase()

  const montoDe = (args) => {
    const o = args[0]
    if (!o || o.amount === undefined || o.amount === null) throw new Error('argumento de transfer sin campo amount')
    return BigInt(o.amount)
  }

  return [
    {
      id: 'transferencia-de-nomina',
      name: 'Permitir solo transferencias de token',
      scope: 'project',
      wallet,
      rules: [{
        name: 'permitir-transfer',
        operation: 'transfer',
        action: 'ALLOW',
        conditions: []
      }]
    },

    {
      id: 'cap-por-transferencia',
      name: `Tope por transferencia: ${formatearMonto(capTx, decimales)} ${token.symbol}`,
      scope: 'project',
      wallet,
      rules: [{
        name: 'denegar-sobre-tope',
        operation: 'transfer',
        action: 'DENY',
        reason: `Supera el tope por transferencia de ${capTx} unidades base (${formatearMonto(capTx, decimales)} ${token.symbol}).`,
        conditions: [({ args }) => montoDe(args) > BigInt(capTx)]
      }]
    },

    {
      id: 'allowlist-destinatarios',
      name: 'Solo destinatarios de la lista',
      scope: 'project',
      wallet,
      rules: [{
        name: 'denegar-fuera-de-lista',
        operation: 'transfer',
        action: 'DENY',
        reason: 'El destinatario no esta en la lista de beneficiarios permitidos.',
        conditions: [({ args }) => {
          const destino = args[0]?.recipient
          if (typeof destino !== 'string') throw new Error('argumento de transfer sin campo recipient')
          return !permitidas.has(destino.toLowerCase())
        }]
      }]
    },

    {
      id: 'solo-token-esperado',
      name: `Solo el token de la nomina (${token.symbol})`,
      scope: 'project',
      wallet,
      rules: [{
        name: 'denegar-otro-token',
        operation: 'transfer',
        action: 'DENY',
        reason: `Esta corrida solo mueve ${token.symbol} en ${token.address}. Otro contrato se deniega.`,
        conditions: [({ args }) => {
          const t = args[0]?.token
          if (typeof t !== 'string') throw new Error('argumento de transfer sin campo token')
          return t.toLowerCase() !== tokenEsperado
        }]
      }]
    },

    {
      id: 'cap-diario',
      name: `Tope diario acumulado: ${formatearMonto(capDay, decimales)} ${token.symbol}`,
      scope: 'project',
      wallet,
      rules: [{
        name: 'denegar-sobre-acumulado',
        operation: 'transfer',
        action: 'DENY',
        reason: `La suma del dia superaria el tope diario de ${capDay} unidades base (${formatearMonto(capDay, decimales)} ${token.symbol}).`,
        conditions: [({ args }) => ledger.proyectado(montoDe(args)) > BigInt(capDay)]
      }]
    }
  ]
}

/**
 * La red donde hay dinero de verdad. Cerrojo declarativo que acompaña al
 * estructural (`toReadOnlyAccount()`, donde el metodo de enviar no existe).
 */
export function politicaSoloLectura ({ wallet }) {
  return {
    id: 'mainnet-solo-lectura',
    name: `Mainnet (${wallet}) es de solo lectura`,
    scope: 'project',
    wallet,
    rules: [{
      name: 'denegar-toda-escritura',
      operation: '*',
      action: 'DENY',
      reason: 'Esta red es de solo lectura en Cerrojo: se leen saldos y tarifas, no se firma ni se envia nada.',
      conditions: []
    }]
  }
}
