'use client'

import { useState } from 'react'
import type { Receipt } from '@/lib/cerrojo'
import { Checks, FeeNote, ReceiptTable, RunMeta, Totals } from '@/components/Receipt'

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
        body: JSON.stringify({ csv, instruccion: instruction, planner })
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
          <p className="text-xs text-muted">
            The engine only accepts payrolls it ships with; an arbitrary filesystem path is a typed 400, not a read.
          </p>
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
          <p className="text-xs text-muted">
            Any language. The deterministic planner never parses this text — it records it on the receipt and reads
            the CSV. The LLM planner does read it, and has produced a valid plan on the first attempt from both a
            Spanish and an English instruction. The demo keeps the Spanish wording because that is what the recorded
            run and the video use.
          </p>
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
          <p className="text-xs text-muted">
            The lock does not change either way. The model only proposes lines; the engine decides them.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={busy || !liveConfigured}
          className="rounded-lg bg-blue px-4 py-2 font-semibold text-on-blue transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Running…' : 'Run through the lock (dry-run)'}
        </button>
        {!liveConfigured && (
          <p className="text-sm text-amber">
            This deployment has no engine URL, so the button is disabled. Set{' '}
            <code className="font-mono">CERROJO_API_URL</code> and redeploy to enable live runs.
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
