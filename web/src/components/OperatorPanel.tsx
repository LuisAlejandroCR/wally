'use client'

import { useState } from 'react'
import type { Receipt } from '@/lib/cerrojo'
import { Checks, DryRunNote, FeeNote, ReceiptTable, RunMeta, Totals } from '@/components/Receipt'

const PAYROLLS = [
  { value: 'evals/fixtures/nomina_agosto.csv', label: 'August payroll (clean)' },
  { value: 'evals/fixtures/nomina_inyeccion.csv', label: 'August payroll with prompt injection' },
  { value: 'evals/fixtures/nomina_sucia.csv', label: 'Dirty data: 10 realistic bad rows' },
  { value: 'evals/fixtures/nomina_bom.csv', label: 'What Excel writes: BOM and a repeated row' }
]

interface ApiError {
  error: { code: string; message: string; suggestion: string }
}

export function OperatorPanel ({ liveConfigured }: { liveConfigured: boolean }) {
  const [csv, setCsv] = useState(PAYROLLS[0].value)
  const [instruction, setInstruction] = useState('paga la nomina de agosto')
  const [planner, setPlanner] = useState<'rules' | 'llm'>('rules')
  const [resetDay, setResetDay] = useState(true)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState<ApiError['error'] | null>(null)

  async function run () {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/live/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv, instruccion: instruction, planner, reiniciar_dia: resetDay })
      })
      const data = await r.json()
      if (!r.ok) {
        setError((data as ApiError).error ?? { code: 'E_DESCONOCIDO', message: 'The run failed.', suggestion: 'Check the engine logs.' })
        setReceipt(null)
        return
      }
      setReceipt((data.recibo ?? data) as Receipt)
    } catch (err) {
      setError({
        code: 'E_RED',
        message: err instanceof Error ? err.message : String(err),
        suggestion: 'The browser could not reach this deployment. Retry, or check the network tab.'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-5 rounded-xl border border-border bg-panel p-5">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="csv">
            1 · Payroll file
          </label>
          <select
            id="csv"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-panel px-3 py-2 text-sm"
          >
            {PAYROLLS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">Only payrolls the engine ships with; any other path is a typed 400.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="instruction">
            2 · Instruction
          </label>
          <input
            id="instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-panel px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted">Any language. Spanish here only to match the recorded run.</p>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">3 · Planner</span>
          <div className="flex flex-wrap gap-2">
            {(['rules', 'llm'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlanner(p)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  planner === p
                    ? 'border-blue/50 bg-blue/15 text-blue'
                    : 'border-border bg-panel-high text-muted hover:text-foreground'
                }`}
              >
                {p === 'rules' ? 'Deterministic rules (no model)' : 'LLM planner'}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">Same lock either way: the model proposes, the engine decides.</p>
        </div>

        {/* One payroll uses 1,296 of the 1,500 daily budget, so the second visitor
            would otherwise find everything refused by `cap-diario` — correct, and
            impossible to read as anything but broken. This zeroes our own counter
            and nothing else: the caps, the allowlist and the token still decide. */}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={resetDay}
            onChange={(e) => setResetDay(e.target.checked)}
            className="mt-0.5 size-4 accent-navy"
          />
          <span>
            Zero today&apos;s counter first
            <span className="mt-0.5 block text-xs text-muted">
              A full payroll spends 1,296 of the 1,500 daily budget. Untick it and run twice to watch the daily cap
              refuse the second run.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={run}
          disabled={busy || !liveConfigured}
          className="rounded-full bg-gold px-5 py-2.5 font-semibold text-navy shadow-[0_14px_30px_-12px_rgba(233,162,59,0.75)] transition-colors hover:bg-gold-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Running…' : 'Run through the lock (dry-run)'}
        </button>
        {!liveConfigured && (
          <p className="text-sm text-amber">
            No engine URL on this deployment, so the button is off. Set{' '}
            <code className="font-mono">CERROJO_API_URL</code> and redeploy.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red/40 bg-red-bg p-5">
          <p className="font-mono text-sm font-bold text-red">{error.code}</p>
          <p className="mt-1">{error.message}</p>
          <p className="mt-2 text-sm text-muted">Suggested fix: {error.suggestion}</p>
        </div>
      )}

      {receipt && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Receipt {receipt.run.id}</h2>
          <Totals receipt={receipt} />
          <ReceiptTable receipt={receipt} />
          <DryRunNote network={receipt.run.network} />
          <FeeNote receipt={receipt} />
          <Checks receipt={receipt} />
          <div className="rounded-xl border border-border bg-panel p-5">
            <RunMeta receipt={receipt} source="live engine" />
          </div>
        </div>
      )}
    </div>
  )
}
