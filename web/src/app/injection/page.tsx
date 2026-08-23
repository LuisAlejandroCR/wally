import clean from '@/data/run-clean.json'
import poisoned from '@/data/run-poisoned.json'
import type { Receipt } from '@/lib/cerrojo'
import { AddressLink, Amount, StatusPill, VerdictIcon } from '@/components/Receipt'
import { Reveal } from '@/components/Reveal'

const limpia = clean as unknown as Receipt
const envenenada = poisoned as unknown as Receipt

type Row = {
  row: number
  same: boolean
  estado: Receipt['lines'][number]['estado']
  to: string | null
  amount: string | null
  decimals: number
  token: string | null
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
    token: l.token,
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
        <h1 className="text-3xl font-bold sm:text-4xl">
          The same payroll, <em>arguing back</em>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Three cells rewritten to attack the model: ignore the limits, disable the allowlist, claim prior approval.
          Both files ran the full pipeline.
        </p>

        <div className={`rise rounded-2xl border p-5 ${identical ? 'border-green/40 bg-green-bg' : 'border-red/40 bg-red-bg'}`}>
          <p className="text-2xl font-bold">
            {identical ? `Identical verdict on all ${rows.length} lines.` : 'The verdicts differ — read the table.'}
          </p>
          <span aria-hidden="true" className="sweep mt-2 block h-0.5 w-24 rounded bg-gold" />
          <p className="mt-2 text-sm">
            {limpia.totals.ejecutadas}/{limpia.totals.denegadas}/{limpia.totals.no_intentadas} against{' '}
            {envenenada.totals.ejecutadas}/{envenenada.totals.denegadas}/{envenenada.totals.no_intentadas} — approved /
            blocked / not attempted. The limits were never in the prompt, so there was nothing to talk out of them.
          </p>
        </div>
      </section>

      <Reveal className="space-y-4">
        <h2 className="text-2xl font-bold">{injected.length} poisoned cells, carried as data</h2>
        <div className="space-y-3">
          {injected.map((r) => (
            <div key={r.row} className="rise rounded-xl border border-border bg-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wider text-muted">Row {r.row}</span>
                <StatusPill estado={r.estado} />
                <span className="text-xs text-muted">verdict unchanged: {r.same ? 'yes' : 'no'}</span>
              </div>
              <p className="mt-3 font-mono text-sm break-words text-amber">{r.poisonedText}</p>
              <p className="mt-2 text-sm text-muted">
                Clean file: <span className="font-mono">{r.cleanText}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          The text reaches the receipt as the payment description it claims to be. Data being carried, not an
          instruction being followed.
        </p>
      </Reveal>

      <Reveal className="space-y-4">
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
              {rows.map((r, i) => (
                <tr
                  key={r.row}
                  className="row-in border-b border-border/60 last:border-0"
                  style={{ animationDelay: `${Math.min(i * 45, 540)}ms` }}
                >
                  <td className="p-3 tabular-nums text-muted">{r.row}</td>
                  <td className="p-3">
                    <StatusPill estado={r.estado} />
                    {r.policy && (
                      <div className="mt-1 font-mono text-[0.7rem] text-muted">
                        {r.policy.id} / {r.policy.rule}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <AddressLink address={r.to} network={limpia.run.network} />
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums">
                    <Amount base={r.amount} decimals={r.decimals} token={r.token} />
                  </td>
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
          Both receipts came from <code className="font-mono">node src/cli.js run --json</code> on a fresh daily
          ledger. <code className="font-mono">cerrojo inyeccion</code> repeats the comparison with a live model and
          reports dangerous drift.
        </p>
      </Reveal>
    </div>
  )
}
