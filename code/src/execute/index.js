import { E } from '../errors.js'
import { esViolacionDePolitica } from '../wdk/session.js'

/** Gas tipico de un transfer ERC-20. Se usa solo para estimar, y el recibo lo marca. */
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
 * Ejecuta un plan linea por linea.
 *
 * El orden importa y es el argumento del proyecto:
 *   1. la politica decide (simulate, sin red),
 *   2. solo lo permitido se cotiza,
 *   3. solo con --live se envia.
 *
 * Ninguna linea llega a la red sin haber pasado por el paso 1.
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

    // Permitida. En dry-run no se envia nada: se estima y se registra en el acumulado.
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
 * Estima la comision de un transfer.
 *
 * Medido en el pre-vuelo: `quoteTransfer` **revierte** desde una cuenta sin
 * fondos ("ERC20: transfer amount exceeds balance"). Cuando eso pasa se cae a
 * `getFeeRates() x gas tipico` y el recibo marca `quoteExacto: false` con su
 * razon. Prohibido presentar una estimacion aproximada como si fuera exacta.
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
 * Panel de mainnet en SOLO LECTURA: saldos y tarifas reales, cero escritura.
 * Dos cerrojos: la cuenta no expone `transfer`, y encima hay una politica que
 * deniega toda escritura en esa red.
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

  // Prueba viva del cerrojo estructural: el metodo de enviar no existe en este objeto.
  panel.transferExiste = typeof sesion.demo.cuenta.transfer === 'function'

  return panel
}
