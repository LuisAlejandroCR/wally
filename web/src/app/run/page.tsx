import Link from 'next/link'
import clean from '@/data/run-clean.json'
import type { Receipt } from '@/lib/cerrojo'
import { Checks, FeeNote, ReceiptTable, RunMeta, Totals } from '@/components/Receipt'
import { liveApiUrl } from '@/lib/cerrojo'

const receipt = clean as unknown as Receipt

export default function RunPage () {
  const live = liveApiUrl() !== null

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue">Recorded run · receipt v1</p>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          One payroll, twelve lines, three states and a reason on every one
        </h1>
        <p className="max-w-3xl text-lg text-muted">
          This is the whole receipt the engine wrote, unedited. The model only <em>proposed</em> these lines: it never
          calls <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">transfer</code>,{' '}
          <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">sign</code> or{' '}
          <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">sendTransaction</code>. Every verdict
          below is a field of that receipt — this page computes none of them.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">August payroll, 12 lines</h2>
            <p className="text-muted">
              Instruction: <span className="font-mono text-sm">&ldquo;{receipt.run.instruction}&rdquo;</span>
            </p>
          </div>
          <p className="text-sm text-muted">
            {live
              ? 'This deployment is wired to a running engine — the Operator page runs it live.'
              : 'Recorded run: the receipt below was produced by the engine and shipped with this page.'}
          </p>
        </div>

        <Totals receipt={receipt} />
        <ReceiptTable receipt={receipt} />
        <FeeNote receipt={receipt} />

        <p className="text-sm text-muted">
          The engine writes its reasons in Spanish. Each one is rendered in English here with the engine&apos;s own
          sentence kept underneath, marked verbatim: the interface translates, it never restates a verdict. {receipt.totals.ejecutadas} + {receipt.totals.denegadas} +{' '}
          {receipt.totals.no_intentadas} = {receipt.totals.lineas}, and the receipt is only issued when that adds up.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">The four deterministic checks</h2>
        <Checks receipt={receipt} />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-xl font-bold">Where this receipt came from</h2>
        <RunMeta receipt={receipt} source={live ? 'recorded run, shipped with the page' : 'shipped with the page'} />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/injection"
          className="rounded-lg bg-blue px-5 py-2.5 font-semibold text-on-blue transition-opacity hover:opacity-90"
        >
          Now run it with the file attacking the model →
        </Link>
        <Link
          href="/policies"
          className="rounded-lg border border-border bg-panel px-5 py-2.5 font-semibold transition-colors hover:bg-panel-high"
        >
          The five policies
        </Link>
      </section>
    </div>
  )
}
