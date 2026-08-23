// src/execute/index.js
//
// The step that touches the chain, and the order it insists on: policy decides
// first without a network, only allowed lines get quoted, and only an explicit
// live mode sends. Every path out of here — a payroll line or an approved
// voucher — goes through that sequence, so nothing reaches the wire unjudged.

import { E } from '../errors.js'
import { esViolacionDePolitica } from '../wdk/session.js'

/** Typical gas for an ERC-20 transfer. Estimation only, and the receipt says so. */
export const GAS_TRANSFER_ERC20 = 65000n

const TIMEOUT_RED_MS = 8000

async function conTimeout (promesa, ms, etiqueta) {
  let t
  try {
    return await Promise.race([
      promesa,
      new Promise((_r, rechazar) => { t = setTimeout(() => rechazar(new Error(`${etiqueta}: sin respuesta en ${ms} ms`)), ms) })
    ])
  } finally {
    clearTimeout(t)
  }
}

/**
 * Executes a plan line by line.
 *
 * The order matters and is the project's whole argument:
 *   1. policy decides (simulate, no network),
 *   2. only what is allowed gets quoted,
 *   3. only --live sends.
 *
 * No line reaches the network without having passed step 1.
 */
export async function ejecutarPlan ({ sesion, plan, cfg, ledger, runId, modo = 'dry-run', sinRed = false }) {
  const resultados = []
  const enVivo = modo === 'live'

  for (const linea of plan.lines) {
    const orden = {
      token: cfg.token.address,
      recipient: linea.to,
      amount: BigInt(linea.amount)
    }

    let verdicto
    try {
      verdicto = await sesion.cuenta.simulate.transfer(orden)
    } catch (err) {
      resultados.push({
        row: linea.row,
        estado: 'no_intentada',
        to: linea.to,
        amount: linea.amount,
        decimals: cfg.token.decimals,
        token: cfg.token.symbol,
        concepto: linea.concepto ?? linea.reason ?? null,
        notaPlanner: linea.reason ?? null,
        why: `La evaluacion de politicas fallo: ${err.message}`
      })
      continue
    }

    if (verdicto.decision === 'DENY') {
      resultados.push({
        row: linea.row,
        estado: 'denegada',
        to: linea.to,
        amount: linea.amount,
        decimals: cfg.token.decimals,
        token: cfg.token.symbol,
        concepto: linea.concepto ?? linea.reason ?? null,
        notaPlanner: linea.reason ?? null,
        policy: {
          id: verdicto.policy_id ?? '<sin politica>',
          rule: verdicto.matched_rule ?? '<sin regla>',
          reason: verdicto.reason ?? 'sin razon declarada'
        }
      })
      continue
    }

    // Allowed. A dry run sends nothing: it estimates and books the accumulator.
    const base = {
      row: linea.row,
      estado: 'ejecutada',
      to: linea.to,
      amount: linea.amount,
      decimals: cfg.token.decimals,
      token: cfg.token.symbol,
      concepto: linea.concepto ?? linea.reason ?? null,
      notaPlanner: linea.reason ?? null,
      dryRun: !enVivo,
      txHash: null
    }

    if (!enVivo) {
      const cotizacion = await estimarComision({ sesion, orden, cfg, sinRed })
      resultados.push({ ...base, ...cotizacion })
      ledger.registrar({ amount: orden.amount, row: linea.row, runId, dryRun: true })
      continue
    }

    try {
      const { hash, fee } = await conTimeout(sesion.cuenta.transfer(orden), TIMEOUT_RED_MS * 4, 'transfer')
      resultados.push({ ...base, txHash: hash, feeEstimada: fee?.toString() ?? null, quoteExacto: true })
      ledger.registrar({ amount: orden.amount, row: linea.row, runId, dryRun: false })
    } catch (err) {
      if (esViolacionDePolitica(err)) {
        resultados.push({
          row: linea.row,
          estado: 'denegada',
          to: linea.to,
          amount: linea.amount,
          decimals: cfg.token.decimals,
          token: cfg.token.symbol,
          concepto: linea.concepto ?? linea.reason ?? null,
          notaPlanner: linea.reason ?? null,
          policy: { id: err.policyId, rule: err.ruleName, reason: err.reason }
        })
        continue
      }
      resultados.push({
        row: linea.row,
        estado: 'no_intentada',
        to: linea.to,
        amount: linea.amount,
        decimals: cfg.token.decimals,
        token: cfg.token.symbol,
        concepto: linea.concepto ?? linea.reason ?? null,
        notaPlanner: linea.reason ?? null,
        why: `El envio fallo antes de confirmarse: ${err.message}`
      })
    }
  }

  return resultados
}

/**
 * Estimates the fee for a transfer.
 *
 * Measured during the pre-flight: `quoteTransfer` **reverts** from an unfunded
 * account ("ERC20: transfer amount exceeds balance"). When that happens it falls
 * back to `getFeeRates() x typical gas` and the receipt marks `quoteExacto:
 * false` with the reason. Presenting an estimate as exact is forbidden.
 */
export async function estimarComision ({ sesion, orden, cfg, sinRed = false }) {
  if (sinRed) {
    return { feeEstimada: null, quoteExacto: false, quoteNota: 'Corrida --sin-red: no se consulto la cadena.' }
  }

  const soloLectura = sesion.cuentaSoloLectura ?? null

  try {
    const cuenta = soloLectura ?? sesion.cuenta
    const { fee } = await conTimeout(cuenta.quoteTransfer(orden), TIMEOUT_RED_MS, 'quoteTransfer')
    return { feeEstimada: fee.toString(), quoteExacto: true, quoteNota: null }
  } catch (errCotizacion) {
    try {
      const tarifas = await conTimeout(sesion.wdk.getFeeRates(cfg.network), TIMEOUT_RED_MS, 'getFeeRates')
      const fee = BigInt(tarifas.normal) * GAS_TRANSFER_ERC20
      return {
        feeEstimada: fee.toString(),
        quoteExacto: false,
        quoteNota: `Estimacion: tarifa de red x ${GAS_TRANSFER_ERC20} de gas. La cotizacion exacta exige fondos en la tesoreria (${resumirError(errCotizacion)}).`
      }
    } catch (errTarifas) {
      return {
        feeEstimada: null,
        quoteExacto: false,
        quoteNota: `No se pudo estimar la comision: ${resumirError(errTarifas)}`,
        error: E.rpcCaido(cfg.rpcUrl, resumirError(errTarifas)).toJSON()
      }
    }
  }
}

function resumirError (err) {
  const m = err?.shortMessage ?? err?.reason ?? err?.message ?? String(err)
  return m.split('\n')[0].slice(0, 160)
}

/**
 * A READ-ONLY mainnet panel: real balances and real fee rates, zero writes.
 * Two locks: the account does not expose `transfer`, and on top of that a policy
 * denies every write on that network.
 */
export async function panelMainnet ({ sesion, cfg }) {
  if (!sesion.demo) return null

  const panel = { network: sesion.demo.network, soloLectura: true, saldoNativo: null, tarifas: null, feeTransferEstimada: null, nota: null }

  try {
    const saldo = await conTimeout(sesion.demo.cuenta.getBalance(), TIMEOUT_RED_MS, 'getBalance')
    panel.saldoNativo = saldo.toString()

    const tarifas = await conTimeout(sesion.wdk.getFeeRates(cfg.demo.network), TIMEOUT_RED_MS, 'getFeeRates')
    panel.tarifas = { normal: tarifas.normal.toString(), fast: tarifas.fast.toString() }
    panel.feeTransferEstimada = (BigInt(tarifas.normal) * GAS_TRANSFER_ERC20).toString()
    panel.nota = `Tarifas reales de ${cfg.demo.network}. Nada se firma ni se envia en esta red: la cuenta es toReadOnlyAccount() y la politica mainnet-solo-lectura deniega toda escritura.`
  } catch (err) {
    panel.nota = `No se pudo leer ${cfg.demo.network}: ${resumirError(err)}`
  }

  // Live proof of the structural lock: the send method does not exist on this object.
  panel.transferExiste = typeof sesion.demo.cuenta.transfer === 'function'

  return panel
}

/**
 * Executes a voucher a person has already approved.
 *
 * The order of operations is the project's, and step 2 is the whole point: the
 * verdict stored on the voucher is not believed. Policy is evaluated again, now,
 * against the accumulator as it stands now. A voucher approved ten minutes ago
 * that would break today's cap is denied all the same, and the voucher keeps the
 * record that it was denied **after** a human said yes.
 *
 *   1. the voucher must be approved, in date and with its fingerprint intact,
 *   2. policy decides again, without touching the network,
 *   3. only mode 'live' sends; dry-run is the default.
 */
export async function ejecutarVale ({ sesion, cfg, ledger, vales, id, modo = 'dry-run', sinRed = false }) {
  const { ok, razon, vale } = vales.verificar(id)
  if (!ok) return { ok: false, razon, vale }

  const orden = {
    token: vale.token.address,
    recipient: vale.orden.recipient,
    amount: BigInt(vale.orden.amount)
  }

  let verdicto
  try {
    verdicto = await sesion.cuenta.simulate.transfer(orden)
  } catch (err) {
    return {
      ok: false,
      razon: `la evaluacion de politicas fallo: ${resumirError(err)}`,
      vale: vales.resolver(id, { estado: 'denegado', modo, why: resumirError(err) })
    }
  }

  if (verdicto.decision === 'DENY') {
    return {
      ok: false,
      razon: verdicto.reason ?? 'denegado por politica',
      revalidacion: 'DENY',
      vale: vales.resolver(id, {
        estado: 'denegado',
        modo,
        policy: {
          id: verdicto.policy_id ?? '<sin politica>',
          rule: verdicto.matched_rule ?? '<sin regla>',
          reason: verdicto.reason ?? 'sin razon declarada'
        }
      })
    }
  }

  if (modo !== 'live') {
    const cotizacion = await estimarComision({ sesion, orden, cfg, sinRed })
    ledger.registrar({ amount: orden.amount, row: null, runId: vale.id, dryRun: true })
    return {
      ok: true,
      revalidacion: 'ALLOW',
      vale: vales.resolver(id, { estado: 'ejecutado', modo: 'dry-run', txHash: null, ...cotizacion })
    }
  }

  try {
    const { hash, fee } = await conTimeout(sesion.cuenta.transfer(orden), TIMEOUT_RED_MS * 4, 'transfer')
    ledger.registrar({ amount: orden.amount, row: null, runId: vale.id, dryRun: false })
    return {
      ok: true,
      revalidacion: 'ALLOW',
      vale: vales.resolver(id, { estado: 'ejecutado', modo: 'live', txHash: hash, feeEstimada: fee?.toString() ?? null, quoteExacto: true })
    }
  } catch (err) {
    if (esViolacionDePolitica(err)) {
      return {
        ok: false,
        razon: err.reason,
        revalidacion: 'DENY',
        vale: vales.resolver(id, { estado: 'denegado', modo: 'live', policy: { id: err.policyId, rule: err.ruleName, reason: err.reason } })
      }
    }
    return {
      ok: false,
      razon: `el envio fallo antes de confirmarse: ${resumirError(err)}`,
      vale: vales.resolver(id, { estado: 'denegado', modo: 'live', why: resumirError(err) })
    }
  }
}
