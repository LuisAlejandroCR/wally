import type { Receipt, ReceiptLine } from '@/lib/cerrojo'
import { ESTADO_LABEL, formatAmount, shortAddress } from '@/lib/cerrojo'

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

export function StatusPill ({ estado }: { estado: ReceiptLine['estado'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${PILL[estado]}`}
    >
      <VerdictIcon estado={estado} />
      {ESTADO_LABEL[estado]}
    </span>
  )
}

export function Totals ({ receipt }: { receipt: Receipt }) {
  const t = receipt.totals
  const cells = [
    { label: 'Executed', value: t.ejecutadas, tone: 'text-green' },
    { label: 'Denied by policy', value: t.denegadas, tone: 'text-red' },
    { label: 'Not attempted', value: t.no_intentadas, tone: 'text-amber' },
    { label: 'Lines in the payroll', value: t.lineas, tone: 'text-foreground' }
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-panel p-4">
          <div className={`text-3xl font-bold tabular-nums ${c.tone}`}>{c.value}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
        </div>
      ))}
      <div className="col-span-2 rounded-xl border border-border bg-panel p-4 sm:col-span-2">
        <div className="text-2xl font-bold tabular-nums text-green">
          {formatAmount(t.montoEjecutado, t.decimals)} <span className="text-base font-medium text-muted">USDT</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted">Moved (simulated)</div>
      </div>
      <div className="col-span-2 rounded-xl border border-border bg-panel p-4 sm:col-span-2">
        <div className="text-2xl font-bold tabular-nums text-red">
          {formatAmount(t.montoDenegado, t.decimals)} <span className="text-base font-medium text-muted">USDT</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted">Stopped by the lock</div>
      </div>
    </div>
  )
}

function Why ({ line }: { line: ReceiptLine }) {
  if (line.policy) {
    return (
      <div>
        <code className="mr-2 rounded bg-panel-high px-1.5 py-0.5 font-mono text-[0.78rem] text-red">
          {line.policy.id} / {line.policy.rule}
        </code>
        <span className="text-muted">{line.policy.reason}</span>
      </div>
    )
  }
  if (line.estado === 'ejecutada') {
    return (
      <div className="text-muted">
        dry-run · estimated fee <span className="font-mono text-xs">{line.feeEstimada ?? '—'}</span> wei{' '}
        {line.quoteExacto === false && <span className="text-amber">— an estimate, not an exact quote</span>}
      </div>
    )
  }
  return <span className="text-muted">{line.why ?? line.notaPlanner ?? '—'}</span>
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
            <th className="p-3 font-semibold">Why — verbatim from the policy engine</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line) => (
            <tr key={line.row} className="border-b border-border/60 last:border-0 align-top">
              <td className="p-3 tabular-nums text-muted">{line.row}</td>
              <td className="p-3">
                <StatusPill estado={line.estado} />
              </td>
              <td className="p-3">
                <span className="font-mono text-xs" title={line.to ?? undefined}>
                  {shortAddress(line.to)}
                </span>
              </td>
              <td className="p-3 text-right font-mono tabular-nums">
                {formatAmount(line.amount, line.decimals)}
                {/* A line with no amount carries no currency either: the CSV never said one. */}
                {line.amount !== null && <span className="ml-1 text-xs text-muted">{line.token ?? ''}</span>}
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
          </div>
          <p className="mt-1 text-sm text-muted">{c.detail}</p>
        </div>
      ))}
    </div>
  )
}

export function RunMeta ({ receipt, source }: { receipt: Receipt; source: string }) {
  const r = receipt.run
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
    </dl>
  )
}
