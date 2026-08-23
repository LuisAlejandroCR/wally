/**
 * The receipt contract, as the engine emits it.
 *
 * These types are transcribed from real `recibo.json` files produced by
 * `node src/cli.js run --json` — not invented here. Nothing in this app decides
 * anything: every `estado`, `policy.id`, `policy.rule` and `policy.reason` on
 * screen is a field of a receipt that WDK's policy engine produced.
 */

export type Estado = 'ejecutada' | 'denegada' | 'no_intentada'

export interface PolicyVerdict {
  id: string
  rule: string
  reason: string
}

export interface ReceiptLine {
  row: number
  estado: Estado
  to: string | null
  amount: string | null
  decimals: number
  token: string | null
  concepto: string | null
  notaPlanner: string | null
  dryRun?: boolean
  txHash?: string | null
  feeEstimada?: string | null
  quoteExacto?: boolean
  quoteNota?: string | null
  policy?: PolicyVerdict
  why?: string | null
}

export interface Receipt {
  version: number
  run: {
    id: string
    startedAt: string
    finishedAt: string
    mode: string
    network: string
    token: { slug: string; decimals: number; address: string }
    instruction: string
    inputFile: string
    inputSha256: string
    planner: { used: boolean; modo: string; model: string | null; retries: number }
  }
  totals: {
    lineas: number
    ejecutadas: number
    denegadas: number
    no_intentadas: number
    montoEjecutado: string
    montoDenegado: string
    decimals: number
    cuadra: boolean
  }
  lines: ReceiptLine[]
  checks: { name: string; ok: boolean; detail: string }[]
  policiesApplied: { id: string; scope: string; estadoFinal?: string; restanteHoy?: string }[]
}

/** Base units to a readable amount. Integers only — never a float, never rounded up. */
export function formatAmount (base: string | null, decimals: number): string {
  if (base === null) return '—'
  const negative = base.startsWith('-')
  const digits = (negative ? base.slice(1) : base).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const frac = decimals > 0 ? `.${digits.slice(digits.length - decimals)}` : ''
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${frac}`
}

export function shortAddress (address: string | null): string {
  if (!address) return '—'
  return address.length <= 14 ? address : `${address.slice(0, 8)}…${address.slice(-6)}`
}

export const ESTADO_LABEL: Record<Estado, string> = {
  ejecutada: 'Executed',
  denegada: 'Denied',
  no_intentada: 'Not attempted'
}

/**
 * Live mode is on only when the deployment was given a URL for a running
 * Cerrojo API. The variable is server-side on purpose: the browser never learns
 * where the engine lives, and the tunnel is not advertised in the page source.
 */
export function liveApiUrl (): string | null {
  const raw = process.env.CERROJO_API_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}
