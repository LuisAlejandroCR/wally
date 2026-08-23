// src/vales.js
//
// Payment vouchers: the human step between what an agent proposes and what gets
// signed. An agent on the MCP channel can create a voucher; it has no tool that
// approves one. Approval lives only in the CLI, where a person types it, and
// that asymmetry is the safety model rather than a convention.

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Six properties this file holds up:
 *
 *   1. **Frozen.** The order is sealed with a sha256 of network + token +
 *      recipient + amount. Approving recomputes the fingerprint; a mismatch does
 *      not execute. A voucher cannot be edited between proposal and signature.
 *   2. **Re-validated.** Policy is evaluated again at approval time. The verdict
 *      stored on the voucher is informational; the one that counts is the one
 *      taken at execution. If the day's total filled up in between, it is denied.
 *   3. **Short-lived.** A voucher expires, so an old approval cannot be replayed.
 *   4. **Single use.** Executing consumes it.
 *   5. **No secrets.** A voucher carries nothing derived from the seed.
 *   6. **Still under the lock.** Approving skips no cap. An approved voucher that
 *      violates a policy is denied all the same, and the voucher keeps the record
 *      that it was denied *after* a human said yes.
 */

/** A voucher lapses quickly: an approval is not a standing permission. */
export const VIGENCIA_MS = 15 * 60 * 1000

export const ESTADOS = ['propuesto', 'aprobado', 'ejecutado', 'denegado', 'rechazado', 'expirado']

/** The fingerprint that freezes the order. One changed byte invalidates it. */
export function huellaDeOrden ({ network, token, recipient, amount }) {
  return createHash('sha256')
    .update([network, String(token).toLowerCase(), String(recipient).toLowerCase(), String(amount)].join('|'))
    .digest('hex')
}

export class Vales {
  constructor ({ dir, ahora = () => new Date() }) {
    this.dir = join(dir, 'vales')
    this.ahora = ahora
  }

  _archivo (id) {
    return join(this.dir, `${id}.json`)
  }

  _escribir (vale) {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this._archivo(vale.id), JSON.stringify(vale, null, 2))
    return vale
  }

  /**
   * Creates a voucher from an order the policy engine has already judged.
   *
   * It is only created on ALLOW: a DENY leaves nothing behind that a human could
   * approve by mistake later on.
   */
  crear ({ orden, veredicto, network, token, motivo = null, origen = 'mcp', vigenciaMs = VIGENCIA_MS }) {
    if (veredicto?.decision !== 'ALLOW') {
      throw new Error('no se crea un vale para una orden que la politica denego')
    }

    const t = this.ahora()
    const id = `vale_${t.toISOString().replace(/[:.]/g, '-')}_${randomBytes(3).toString('hex')}`

    return this._escribir({
      id,
      estado: 'propuesto',
      origen,
      creado: t.toISOString(),
      expira: new Date(t.getTime() + vigenciaMs).toISOString(),
      network,
      token: { symbol: token.symbol, address: token.address, decimals: token.decimals },
      orden: { recipient: orden.recipient, amount: String(orden.amount) },
      huella: huellaDeOrden({ network, token: token.address, recipient: orden.recipient, amount: orden.amount }),
      motivo,
      veredictoAlProponer: {
        decision: veredicto.decision,
        policy_id: veredicto.policy_id ?? null,
        matched_rule: veredicto.matched_rule ?? null,
        reason: veredicto.reason ?? null
      },
      aprobadoPor: null,
      aprobadoEn: null,
      resuelto: null
    })
  }

  leer (id) {
    // The id arrives from an agent, so it is not concatenated into a path unlooked at.
    if (!/^vale_[A-Za-z0-9_-]+$/.test(id)) return null
    const f = this._archivo(id)
    if (!existsSync(f)) return null
    try {
      return this._caducar(JSON.parse(readFileSync(f, 'utf8')))
    } catch {
      return null
    }
  }

  listar () {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => this.leer(f.replace(/\.json$/, '')))
      .filter(Boolean)
      .sort((a, b) => (a.creado < b.creado ? 1 : -1))
  }

  pendientes () {
    return this.listar().filter((v) => v.estado === 'propuesto')
  }

  /** A lapsed voucher flips to `expirado` the moment anyone looks at it. */
  _caducar (vale) {
    if (vale.estado !== 'propuesto' && vale.estado !== 'aprobado') return vale
    if (new Date(vale.expira).getTime() > this.ahora().getTime()) return vale
    return this._escribir({ ...vale, estado: 'expirado' })
  }

  /**
   * Marks a voucher approved by a person. This executes nothing, and there is no
   * route that reaches it from the agent channel.
   */
  aprobar (id, { por = 'operador local' } = {}) {
    const vale = this.leer(id)
    if (!vale) throw new Error(`no existe el vale ${id}`)
    if (vale.estado !== 'propuesto') throw new Error(`el vale ${id} esta ${vale.estado}, no se puede aprobar`)
    return this._escribir({ ...vale, estado: 'aprobado', aprobadoPor: por, aprobadoEn: this.ahora().toISOString() })
  }

  rechazar (id, { motivo = null } = {}) {
    const vale = this.leer(id)
    if (!vale) throw new Error(`no existe el vale ${id}`)
    if (vale.estado !== 'propuesto' && vale.estado !== 'aprobado') {
      throw new Error(`el vale ${id} esta ${vale.estado}, no se puede rechazar`)
    }
    return this._escribir({ ...vale, estado: 'rechazado', resuelto: { at: this.ahora().toISOString(), motivo } })
  }

  /** Closes the voucher with what actually happened when it was executed. */
  resolver (id, resultado) {
    const vale = this.leer(id)
    if (!vale) throw new Error(`no existe el vale ${id}`)
    return this._escribir({
      ...vale,
      estado: resultado.estado,
      resuelto: { at: this.ahora().toISOString(), ...resultado }
    })
  }

  /**
   * Checks that a voucher is still executable and that its order has not moved.
   * Returns `{ ok, razon }` and never throws, so the caller picks the tone.
   */
  verificar (id) {
    const vale = this.leer(id)
    if (!vale) return { ok: false, razon: `no existe el vale ${id}`, vale: null }
    if (vale.estado === 'expirado') return { ok: false, razon: `el vale vencio el ${vale.expira}`, vale }
    if (vale.estado !== 'aprobado') return { ok: false, razon: `el vale esta ${vale.estado}, no aprobado`, vale }

    const esperada = huellaDeOrden({
      network: vale.network,
      token: vale.token.address,
      recipient: vale.orden.recipient,
      amount: vale.orden.amount
    })
    if (esperada !== vale.huella) return { ok: false, razon: 'la orden del vale no coincide con su huella', vale }

    return { ok: true, razon: null, vale }
  }
}
