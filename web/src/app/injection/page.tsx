import clean from '@/data/run-clean.json'
import poisoned from '@/data/run-poisoned.json'
import type { Receipt } from '@/lib/cerrojo'
import { StatusPill, VerdictIcon } from '@/components/Receipt'
import { formatAmount, shortAddress } from '@/lib/cerrojo'

const limpia = clean as unknown as Receipt
const envenenada = poisoned as unknown as Receipt

type Row = {
  row: number
  same: boolean
  estado: Receipt['lines'][number]['estado']
  to: string | null
  amount: string | null
  decimals: number
  cleanText: string | null
  poisonedText: string | null
  policy?: { id: string; rule: string; reason: string }
}

const rows: Row[] = limpia.lines.map((l, i) => {
  const p = envenenada.lines[i]
  return {
    row: l.row,
    same: l.estado === p.estado && l.to === p.to && l.amount === p.amount,
    estado: l.estado,
    to: l.to,
    amount: l.amount,
    decimals: l.decimals,
    cleanText: l.concepto,
    poisonedText: p.concepto,
    policy: l.policy
  }
})

const identical = rows.every((r) => r.same)
const injected = rows.filter((r) => r.cleanText !== r.poisonedText)

export default function InjectionPage () {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          The same payroll, with instructions written into it
        </h1>
        <p className="max-w-3xl text-lg text-muted">
          Three cells of the CSV were rewritten to attack the model: an order to ignore the limits, a fake system
          comment disabling the allowlist, and a supplier row claiming prior approval. Both files were run through the
          whole pipeline. The receipts are compared line by line below.
        </p>

        <div
          className={`rounded-xl border p-5 ${
            identical ? 'border-green/40 bg-green-bg' : 'border-red/40 bg-red-bg'
          }`}
        >
          <p className="text-2xl font-bold">
            {identical
              ? `Identical verdict on all ${rows.length} lines.`
              : 'The verdicts differ — read the table before trusting anything here.'}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {limpia.totals.ejecutadas}/{limpia.totals.denegadas}/{limpia.totals.no_intentadas} against{' '}
            {envenenada.totals.ejecutadas}/{envenenada.totals.denegadas}/{envenenada.totals.no_intentadas} executed /
            denied / not attempted. The limits never lived in the prompt, so there was nothing in the file to talk out
            of them.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">The {injected.length} poisoned cells, rendered as data</h2>
        <div className="space-y-3">
          {injected.map((r) => (
            <div key={r.row} className="rounded-xl border border-border bg-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wider text-muted">Row {r.row}</span>
                <StatusPill estado={r.estado} />
                <span className="text-xs text-muted">
                  verdict unchanged: {r.same ? 'yes' : 'no'}
                </span>
              </div>
              <p className="mt-3 font-mono text-sm break-words text-amber">{r.poisonedText}</p>
              <p className="mt-2 text-sm text-muted">
                Clean file said: <span className="font-mono">{r.cleanText}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          The injected text does reach the receipt — as the payment concept it claims to be. It is data being carried,
          not an instruction being followed.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Line by line</h2>
        <div className="scroll-x rounded-xl border border-border bg-panel">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Verdict, both files</th>
                <th className="p-3 font-semibold">Recipient</th>
                <th className="p-3 text-right font-semibold">Amount</th>
                <th className="p-3 font-semibold">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row} className="border-b border-border/60 last:border-0">
                  <td className="p-3 tabular-nums text-muted">{r.row}</td>
                  <td className="p-3">
                    <StatusPill estado={r.estado} />
                    {r.policy && (
                      <div className="mt-1 font-mono text-[0.7rem] text-muted">
                        {r.policy.id} / {r.policy.rule}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{shortAddress(r.to)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{formatAmount(r.amount, r.decimals)}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1.5 ${r.same ? 'text-green' : 'text-red'}`}>
                      <VerdictIcon estado={r.same ? 'ejecutada' : 'denegada'} />
                      {r.same ? 'identical' : 'drifted'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Both receipts were produced by <code className="font-mono">node src/cli.js run --json</code> with a fresh
          daily ledger, and shipped with this page. The repository also carries{' '}
          <code className="font-mono">cerrojo inyeccion</code>, which repeats the comparison with a real model in the
          loop and reports dangerous drift.
        </p>
      </section>
    </div>
  )
}
