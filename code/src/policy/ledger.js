// src/policy/ledger.js
//
// The daily accumulator behind the daily cap. It exists as its own object
// because WDK cannot be asked to keep this state — see the finding below — so
// the policy conditions read it through a closure. It remembers how much was
// spent; the policy is still the thing that decides.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Finding, read out of @tetherto/wdk 1.0.0-beta.16: the `onSuccess` field of the
 * policy schema is declared but **ignored at runtime**
 * (`src/policy/policy-engine.js`: "Reserved for future use; currently ignored").
 * The accumulator therefore cannot be delegated to the library. It lives in this
 * object, which the conditions read through a closure — the route the WDK README
 * documents ("conditions ... may carry user-owned state via closures").
 */
export class LedgerDiario {
  constructor ({ dir, network, fecha = hoyUTC(), persistir = true }) {
    this.dir = dir
    this.network = network
    this.fecha = fecha
    this.persistir = persistir
    this.gastado = 0n
    this.movimientos = []

    if (this.persistir) this._cargar()
  }

  get archivo () {
    return join(this.dir, `ledger-${this.network}-${this.fecha}.json`)
  }

  _cargar () {
    if (!existsSync(this.archivo)) return
    try {
      const datos = JSON.parse(readFileSync(this.archivo, 'utf8'))
      this.gastado = BigInt(datos.gastado ?? '0')
      this.movimientos = datos.movimientos ?? []
    } catch {
      // A corrupt ledger counts as 0 spent: the cap gets stricter, never looser.
      this.gastado = 0n
      this.movimientos = []
    }
  }

  _guardar () {
    if (!this.persistir) return
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.archivo, JSON.stringify({
      fecha: this.fecha,
      network: this.network,
      gastado: this.gastado.toString(),
      movimientos: this.movimientos
    }, null, 2))
  }

  /** What the total would be if `amount` executed. Pure, mutates nothing. */
  proyectado (amount) {
    return this.gastado + BigInt(amount)
  }

  restante (cap) {
    const r = BigInt(cap) - this.gastado
    return r > 0n ? r : 0n
  }

  /** Called ONLY when a line executed, or simulated as executable. */
  registrar ({ amount, row, runId, dryRun }) {
    this.gastado += BigInt(amount)
    this.movimientos.push({ row, runId, amount: BigInt(amount).toString(), dryRun, at: new Date().toISOString() })
    this._guardar()
    return this.gastado
  }

  reset () {
    this.gastado = 0n
    this.movimientos = []
    this._guardar()
  }
}

export function hoyUTC (d = new Date()) {
  return d.toISOString().slice(0, 10)
}
