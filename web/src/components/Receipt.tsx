import type { Receipt, ReceiptLine } from '@/lib/cerrojo'
import { explorerAddressUrl, formatAmount, formatAmount2, shortAddress, statusLabel } from '@/lib/cerrojo'
import { CopyAddress } from '@/components/CopyAddress'
import { checkDetailEn, checkLabelEn, quoteNoteEn, reasonEn, ruleNameEn, whyEn } from '@/lib/english'

/**
 * Why the recipients are not links.
 *
 * Nothing was broadcast and the payroll rows are invented, so no explorer has
 * an entry for any of them. Linking to an empty page would look like a broken
 * demo; the addresses copy instead. The one real object here is the token
 * contract, linked in the run metadata.
 */
export function DryRunNote ({ network }: { network: string }) {
  return (
    <p className="text-sm text-muted">
      <span className="text-foreground">Dry run.</span> Nothing was broadcast on {network}, and the payroll rows are
      synthetic addresses, so none of them exists on a block explorer — click one to copy it instead. The token
      contract below is the real deployment.
    </p>
  )
}

/** Two decimals on screen, the exact figure on hover. */
export function Amount ({ base, decimals, token }: { base: string | null; decimals: number; token?: string | null }) {
  if (base === null) return <span className="text-muted">—</span>
  return (
    <span title={`${formatAmount(base, decimals)} ${token ?? ''}`.trim()}>
      {formatAmount2(base, decimals)}
      {token ? <span className="ml-1 text-xs text-muted">{token}</span> : null}
    </span>
  )
}

const PILL: Record<string, string> = {
  ejecutada: 'bg-green-bg text-green border-green/40',
  denegada: 'bg-red-bg text-red border-red/40',
  no_intentada: 'bg-amber-bg text-amber border-amber/40'
}

/**
 * Icons are SVG, not emoji: an emoji renders differently on every platform and
 * is read aloud as its own name, which is not what a verdict should sound like.
 * Each path is decorative — the pill's text carries the meaning.
 */
export function VerdictIcon ({ estado }: { estado: ReceiptLine['estado'] }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false
  }
  if (estado === 'ejecutada') {
    return (
      <svg {...common}>
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
    )
  }
  if (estado === 'denegada') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" />
        <path d="M3.8 3.8l8.4 8.4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M6 3.5v9M10 3.5v9" />
    </svg>
  )
}

export function StatusPill ({ estado, txHash = null }: { estado: ReceiptLine['estado']; txHash?: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${PILL[estado]}`}
    >
      <VerdictIcon estado={estado} />
      {statusLabel({ estado, txHash })}
    </span>
  )
}

export function Totals ({ receipt }: { receipt: Receipt }) {
  const t = receipt.totals
  const cells = [
    { label: 'Approved', value: t.ejecutadas, tone: 'text-green' },
    { label: 'Blocked', value: t.denegadas, tone: 'text-red' },
    { label: 'Not attempted', value: t.no_intentadas, tone: 'text-amber' },
    { label: 'Lines', value: t.lineas, tone: 'text-foreground' }
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className="count-in rise rounded-xl border border-border bg-panel p-4"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className={`text-3xl font-bold tabular-nums ${c.tone}`}>{c.value}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
        </div>
      ))}
      <div className="col-span-2 rise rounded-xl border border-green/40 bg-green-bg p-4">
        <div className="text-2xl font-bold tabular-nums text-green">
          <Amount base={t.montoEjecutado} decimals={t.decimals} /> <span className="text-base font-medium text-muted">USDT</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted">Authorised · simulated</div>
      </div>
      <div className="col-span-2 rise rounded-xl border border-red/40 bg-red-bg p-4">
        <div className="text-2xl font-bold tabular-nums text-red">
          <Amount base={t.montoDenegado} decimals={t.decimals} /> <span className="text-base font-medium text-muted">USDT</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted">Stopped by the lock</div>
      </div>
    </div>
  )
}

/**
 * The engine writes its reasons in Spanish. The English rendering is shown
 * first, and the engine's own sentence stays underneath, marked as verbatim —
 * so the page reads in English without any verdict being restated.
 */
function Verbatim ({ text }: { text: string }) {
  return (
    <span className="mt-1 block text-xs text-muted">
      <span className="uppercase tracking-wider">verbatim:</span> <span lang="es">{text}</span>
    </span>
  )
}

function Why ({ line }: { line: ReceiptLine }) {
  if (line.policy) {
    const english = reasonEn(line.policy.id, line.policy.rule, line.policy.reason)
    return (
      <div>
        <code className="mr-2 rounded bg-panel-high px-1.5 py-0.5 font-mono text-[0.78rem] text-red">
          {line.policy.id} / {ruleNameEn(line.policy.rule) ?? line.policy.rule}
        </code>
        <span className="text-foreground">{english ?? line.policy.reason}</span>
        {english && <Verbatim text={line.policy.reason} />}
      </div>
    )
  }
  if (line.estado === 'ejecutada') {
    return (
      <div className="text-muted">
        dry-run · fee <span className="font-mono text-xs">{line.feeEstimada ?? '—'}</span> wei{' '}
        {line.quoteExacto === false && <span className="text-amber">(estimate)</span>}
      </div>
    )
  }
  const raw = line.why ?? line.notaPlanner ?? null
  const english = whyEn(raw)
  return (
    <div>
      <span className="text-foreground">{english ?? raw ?? '—'}</span>
      {english && raw && <Verbatim text={raw} />}
    </div>
  )
}

export function ReceiptTable ({ receipt }: { receipt: Receipt }) {
  return (
    <div className="scroll-x rounded-xl border border-border bg-panel">
      <table className="w-full min-w-[54rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
            <th className="p-3 font-semibold">#</th>
            <th className="p-3 font-semibold">Verdict</th>
            <th className="p-3 font-semibold">Recipient</th>
            <th className="p-3 text-right font-semibold">Amount</th>
            <th className="p-3 font-semibold">Why — the engine&apos;s own words</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr
              key={line.row}
              className="row-in border-b border-border/60 last:border-0 align-top"
              style={{ animationDelay: `${Math.min(i * 45, 540)}ms` }}
            >
              <td className="p-3 tabular-nums text-muted">{line.row}</td>
              <td className="p-3">
                <StatusPill estado={line.estado} txHash={line.txHash ?? null} />
              </td>
              <td className="p-3">
                <CopyAddress address={line.to} />
              </td>
              <td className="p-3 text-right font-mono tabular-nums">
                {/* A line with no amount carries no currency either: the CSV never said one. */}
                <Amount base={line.amount} decimals={line.decimals} token={line.token} />
              </td>
              <td className="p-3">
                <Why line={line} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The fee note is the same sentence on every estimated line: print it once. */
export function FeeNote ({ receipt }: { receipt: Receipt }) {
  const line = receipt.lines.find((l) => l.quoteExacto === false && l.quoteNota)
  if (!line) return null
  const english = quoteNoteEn(line.quoteNota)
  return (
    <p className="text-sm text-muted">
      <span className="text-amber">Fees are estimates.</span> {english ?? line.quoteNota} Amounts show two decimals;
      hover for the exact figure.
    </p>
  )
}

export function Checks ({ receipt }: { receipt: Receipt }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {receipt.checks.map((c) => (
        <div key={c.name} className="rounded-xl border border-border bg-panel p-4">
          <div className="flex items-center gap-2">
            <span className={c.ok ? 'text-green' : 'text-red'}>
              <VerdictIcon estado={c.ok ? 'ejecutada' : 'denegada'} />
            </span>
            <code className="font-mono text-sm">{c.name}</code>
            {checkLabelEn(c.name) && <span className="text-sm text-muted">— {checkLabelEn(c.name)}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">{checkDetailEn(c.name, c.detail) ?? c.detail}</p>
        </div>
      ))}
    </div>
  )
}

export function RunMeta ({ receipt, source }: { receipt: Receipt; source: string }) {
  const r = receipt.run
  const tokenUrl = explorerAddressUrl(r.token.address, r.network)
  const items = [
    ['Run', r.id],
    ['Mode', r.mode],
    ['Network', r.network],
    ['Token', `${r.token.slug.toUpperCase()} · ${r.token.decimals} decimals`],
    ['Planner', r.planner.used ? `${r.planner.modo} · ${r.planner.model ?? ''}` : `${r.planner.modo} (no model)`],
    ['Input', r.inputFile],
    ['Input sha256', `${r.inputSha256.slice(0, 16)}…`],
    ['Source', source]
  ] as const

  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
          <dd className="font-mono text-xs break-all">{v}</dd>
        </div>
      ))}
      {/* The one address on this page with a populated explorer page: the token
          contract is real and deployed, which the empty recipient pages are not. */}
      <div>
        <dt className="text-xs uppercase tracking-wider text-muted">Token contract</dt>
        <dd className="font-mono text-xs break-all">
          {tokenUrl ? (
            <a
              href={tokenUrl}
              target="_blank"
              rel="noreferrer"
              title={`${r.token.address} on ${r.network}`}
              className="text-blue underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {shortAddress(r.token.address)} ↗
            </a>
          ) : (
            shortAddress(r.token.address)
          )}
        </dd>
      </div>
    </dl>
  )
}
