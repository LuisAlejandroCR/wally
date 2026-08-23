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

/**
 * The same amount with trailing zeros dropped, for a headline figure.
 *
 * Lossless on purpose: it only removes zeros that carry no information, so
 * `1296.000000` reads `1,296.00` and `180.500000` reads `180.50`. No value is
 * ever rounded — a payroll figure that changed on the way to the screen would
 * be a worse bug than an ugly one.
 */
export function formatAmountShort (base: string | null, decimals: number, minFrac = 2): string {
  const full = formatAmount(base, decimals)
  if (!full.includes('.')) return full
  const [whole, frac] = full.split('.')
  const trimmed = frac.replace(/0+$/, '')
  const kept = trimmed.padEnd(Math.min(minFrac, frac.length), '0')
  return kept.length > 0 ? `${whole}.${kept}` : whole
}

/**
 * The same amount at two decimals, which is how a person reads money.
 *
 * Truncated, never rounded: a figure on screen can be shorter than the receipt,
 * never larger than what the engine authorised. The exact value stays one hover
 * away — every caller passes the full string as a title.
 */
export function formatAmount2 (base: string | null, decimals: number): string {
  const full = formatAmount(base, decimals)
  if (full === '—') return full
  if (!full.includes('.')) return `${full}.00`
  const [whole, frac] = full.split('.')
  return `${whole}.${`${frac}00`.slice(0, 2)}`
}

export function shortAddress (address: string | null): string {
  if (!address) return '—'
  return address.length <= 14 ? address : `${address.slice(0, 8)}…${address.slice(-6)}`
}

/**
 * Block explorer for the network the receipt says it ran on. Unknown network,
 * no link: a wrong explorer is worse than none, because it renders an address
 * that never existed there.
 */
const EXPLORER: Record<string, string> = {
  sepolia: 'https://sepolia.etherscan.io',
  mainnet: 'https://etherscan.io',
  polygon: 'https://polygonscan.com'
}

export function explorerAddressUrl (address: string | null, network: string): string | null {
  const base = EXPLORER[network]
  if (!base || !address) return null
  return `${base}/address/${address}`
}

export const ESTADO_LABEL: Record<Estado, string> = {
  ejecutada: 'Approved',
  denegada: 'Blocked',
  no_intentada: 'Not attempted'
}

/**
 * The label a line has earned, which is not always the name of its state.
 *
 * The engine calls a line `ejecutada` once the policy engine allowed it and the
 * execution layer processed it — but in a dry run nothing was sent, so calling
 * that "Executed" on screen would claim a transaction that does not exist. A
 * line is only EXECUTED when it carries a transaction hash; until then it is
 * APPROVED, which is what actually happened to it.
 */
export function statusLabel (line: Pick<ReceiptLine, 'estado' | 'txHash'>): string {
  if (line.estado === 'ejecutada') return line.txHash ? 'Executed' : 'Approved'
  return ESTADO_LABEL[line.estado]
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
