import Link from 'next/link'
import clean from '@/data/run-clean.json'
import type { Receipt } from '@/lib/cerrojo'
import { Checks, FeeNote, ReceiptTable, RunMeta, Totals } from '@/components/Receipt'
import { Reveal } from '@/components/Reveal'
import { liveApiUrl } from '@/lib/cerrojo'

const receipt = clean as unknown as Receipt

export default function RunPage () {
  const live = liveApiUrl() !== null
  const t = receipt.totals

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-panel/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-navy">
          <span aria-hidden="true" className="h-0.5 w-5 rounded bg-gold" />
          Recorded run · receipt v1
        </p>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
          Twelve lines. Three states. <em>A reason on every one.</em>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          The receipt the engine wrote, unedited. The model proposed these lines; it never signs or sends. This page
          computes none of the verdicts below.
        </p>
      </section>

      <Reveal className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">August payroll</h2>
            <p className="text-muted">
              Instruction: <span className="font-mono text-sm">&ldquo;{receipt.run.instruction}&rdquo;</span>
            </p>
          </div>
          <p className="text-sm text-muted">{live ? 'Engine wired: run it on Operator.' : 'Recorded receipt.'}</p>
        </div>

        <Totals receipt={receipt} />
        <ReceiptTable receipt={receipt} />
        <FeeNote receipt={receipt} />

        <p className="text-sm text-muted">
          Reasons are shown in English with the engine&apos;s own sentence underneath, marked verbatim. {t.ejecutadas} +{' '}
          {t.denegadas} + {t.no_intentadas} = {t.lineas}: no receipt is issued unless that adds up.
        </p>
      </Reveal>

      <Reveal className="space-y-4">
        <h2 className="text-2xl font-bold">Four deterministic checks</h2>
        <Checks receipt={receipt} />
      </Reveal>

      <Reveal className="space-y-4 rounded-2xl border border-border bg-panel p-5 shadow-[0_18px_44px_-22px_rgba(18,41,79,0.28)]">
        <h2 className="text-xl font-bold">Provenance</h2>
        <RunMeta receipt={receipt} source={live ? 'recorded run, shipped with the page' : 'shipped with the page'} />
      </Reveal>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/injection"
          className="rounded-full bg-gold px-5 py-2.5 font-semibold text-navy shadow-[0_14px_30px_-12px_rgba(233,162,59,0.75)] transition-colors hover:bg-gold-2"
        >
          Now attack the model →
        </Link>
        <Link
          href="/policies"
          className="rounded-full border border-border bg-panel px-5 py-2.5 font-semibold transition-colors hover:bg-panel-high"
        >
          The five policies
        </Link>
      </section>
    </div>
  )
}
