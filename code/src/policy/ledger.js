import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Acumulador diario del tope.
 *
 * ⚠️ Hallazgo del codigo de @tetherto/wdk 1.0.0-beta.16: el campo `onSuccess` del
 * esquema de politicas esta declarado pero **ignorado en runtime**
 * (`src/policy/policy-engine.js`: "Reserved for future use; currently ignored").
 * El acumulado no puede delegarse a la libreria: lo lleva este objeto, que las
 * condiciones leen por closure — la via que el README de WDK documenta
 * ("conditions ... may carry user-owned state via closures").
 *
 * Quien decide sigue siendo la politica. Este objeto solo recuerda cuanto se gasto.
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
      // Un ledger corrupto se trata como 0 gastado: el tope queda mas estricto, nunca mas laxo.
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

  /** Cuanto quedaria gastado si se ejecutara `amount`. Puro, no muta. */
  proyectado (amount) {
    return this.gastado + BigInt(amount)
  }

  restante (cap) {
    const r = BigInt(cap) - this.gastado
    return r > 0n ? r : 0n
  }

  /** Se llama SOLO cuando una linea se ejecuto (o se simulo como ejecutable). */
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
