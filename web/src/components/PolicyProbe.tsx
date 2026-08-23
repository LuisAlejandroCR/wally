'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatAmount } from '@/lib/cerrojo'
import { policyNameEn, reasonEn, ruleNameEn } from '@/lib/english'

/**
 * Ask the lock about one payment.
 *
 * The payroll screen shows the engine judging twelve lines someone else wrote.
 * This shows it judging a line *you* wrote, which is a different kind of proof:
 * the caps are not a property of our fixtures. Type an address and an amount and
 * the verdict comes back with the policy, the rule and the engine's own reason.
 *
 * It calls `POST /simular`, which decides and returns — no plan, no receipt, no
 * ledger movement, no network. Refusing costs nothing, so this can be hammered.
 */

const DECIMALS = 6
const SYMBOL = 'USDT'

/** Someone on the payroll's allowlist. */
const ON_LIST = '0x17d5D5fC28ee6240e1129CCBf386458071b056F9'
/** The burn address the poisoned payroll tries to reach. Never on the list. */
const STRANGER = '0x000000000000000000000000000000000000dEaD'
/** Any contract that is not the payroll token. This one is WDK's registry USD₮. */
const OTHER_TOKEN = '0xd077A400968890Eacc75cdc901F0356c943e4fDb'

type Preset = {
  label: string
  expect: string
  recipient: string
  amount: string
  token?: string
}

// Each preset aims at one rule by name. The labels say what is being tested
// rather than promising a verdict: whether 250 passes depends on how much of the
// day is left, and a promise the engine then breaks reads as a bug.
const PRESETS: Preset[] = [
  { label: 'Pay 250 to someone on the payroll', expect: 'within every limit', recipient: ON_LIST, amount: '250' },
  { label: 'Pay 900 to the same person', expect: 'aims at the per-transfer cap', recipient: ON_LIST, amount: '900' },
  { label: 'Pay 400 to a stranger', expect: 'aims at the allowlist', recipient: STRANGER, amount: '400' },
  { label: 'Pay 250 in a different token', expect: 'aims at the token pin', recipient: ON_LIST, amount: '250', token: OTHER_TOKEN }
]

interface DayState {
  gastado: { base: string; legible: string }
  tope: { base: string; legible: string }
  restante: { base: string; legible: string }
}

interface Verdict {
  decision: 'ALLOW' | 'DENY'
  politica: string | null
  regla: string | null
  razon: string | null
  monto: { base: string; legible: string }
  traza?: { scope: string; policy_id: string; rule_name: string; matched: boolean }[]
}

interface ApiError {
  error: { code: string; message: string; suggestion: string }
}

/**
 * "12.5" → "12500000" at six decimals, with no float anywhere near it. Extra
 * decimals are an error rather than something to round away quietly: this is the
 * same rule the engine's own parser follows.
 */
function toBaseUnits (input: string): { base: string } | { error: string } {
  const raw = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(raw)) return { error: `"${input}" is not a positive number.` }

  const [whole, frac = ''] = raw.split('.')
  if (frac.length > DECIMALS) return { error: `${SYMBOL} has ${DECIMALS} decimals; "${input}" has ${frac.length}.` }

  // Concatenation rather than arithmetic: no number type is involved at any
  // point, so there is nothing for a float to round.
  const digits = (whole + (frac + '0'.repeat(DECIMALS)).slice(0, DECIMALS)).replace(/^0+(?=\d)/, '')
  return { base: digits }
}

export function PolicyProbe ({ liveConfigured }: { liveConfigured: boolean }) {
  const [recipient, setRecipient] = useState(ON_LIST)
  const [amount, setAmount] = useState('900')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<ApiError['error'] | null>(null)
  const [day, setDay] = useState<DayState | null>(null)

  // How much of the daily budget is left, refreshed after every verdict. Without
  // it, `cap-diario` refusing a perfectly ordinary 250 looks like a broken demo
  // instead of the counter doing its job.
  const loadDay = useCallback(async () => {
    if (!liveConfigured) return
    try {
      const r = await fetch('/api/live/day', { method: 'POST' })
      if (r.ok) setDay((await r.json()) as DayState)
    } catch {
      // A missing counter is cosmetic. The verdict below is the evidence.
    }
  }, [liveConfigured])

  useEffect(() => {
    void loadDay()
  }, [loadDay])

  async function ask (over?: Preset) {
    const useRecipient = over?.recipient ?? recipient
    const useAmount = over?.amount ?? amount
    const useToken = over ? (over.token ?? '') : token

    if (over) {
      setRecipient(useRecipient)
      setAmount(useAmount)
      setToken(useToken)
    }

    const parsed = toBaseUnits(useAmount)
    if ('error' in parsed) {
      setError({ code: 'E_MONTO_INVALIDO', message: parsed.error, suggestion: `Amounts are integers in base units; the form converts for you. 250 ${SYMBOL} is 250000000.` })
      setVerdict(null)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/live/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destinatario: useRecipient.trim(),
          monto_base: parsed.base,
          ...(useToken.trim() ? { token: useToken.trim() } : {})
        })
      })
      const data = await r.json()
      if (!r.ok) {
        setError((data as ApiError).error ?? { code: 'E_DESCONOCIDO', message: 'The engine refused the request.', suggestion: 'Check the address and the amount.' })
        setVerdict(null)
        return
      }
      setVerdict(data as Verdict)
      void loadDay()
    } catch (err) {
      setError({
        code: 'E_RED',
        message: err instanceof Error ? err.message : String(err),
        suggestion: 'The browser could not reach this deployment. Retry, or read the recorded evidence on The proof.'
      })
    } finally {
      setBusy(false)
    }
  }

  const allowed = verdict?.decision === 'ALLOW'

  return (
    <div className="space-y-5">
      {day && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-xl border border-border bg-panel-high px-5 py-3 text-sm">
          <span className="font-semibold">
            Today: {day.gastado.legible} of {day.tope.legible} committed
          </span>
          <span className="text-muted">
            {day.restante.legible} left before <code className="font-mono text-xs">cap-diario</code> refuses on amount
            alone
          </span>
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-border bg-panel p-5">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Try one of these</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy || !liveConfigured}
                onClick={() => ask(p)}
                className="rounded-lg border border-border bg-panel-high px-3 py-2 text-left text-sm transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="font-semibold">{p.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{p.expect}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="probe-to">
              Recipient
            </label>
            <input
              id="probe-to"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              spellCheck={false}
              className="w-full rounded-lg border border-border-strong bg-panel px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="probe-amount">
              Amount ({SYMBOL})
            </label>
            <input
              id="probe-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg border border-border-strong bg-panel px-3 py-2 text-right font-mono text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="probe-token">
            Token contract — optional
          </label>
          <input
            id="probe-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="empty means the payroll token"
            spellCheck={false}
            className="w-full rounded-lg border border-border-strong bg-panel px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted">Any other contract is refused by name, whatever it is worth.</p>
        </div>

        <button
          type="button"
          onClick={() => ask()}
          disabled={busy || !liveConfigured}
          className="rounded-full bg-navy px-5 py-2.5 font-semibold text-panel transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Asking…' : 'Ask the lock'}
        </button>
        {!liveConfigured && (
          <p className="text-sm text-amber">
            No engine URL on this deployment, so the button is off. The recorded verdicts are on{' '}
            <span className="font-semibold">The proof</span>.
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

      {verdict && (
        <div className={`rounded-2xl border p-5 ${allowed ? 'border-green/40 bg-green-bg' : 'border-red/40 bg-red-bg'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className={`text-3xl font-bold ${allowed ? 'text-green' : 'text-red'}`}>{verdict.decision}</p>
            <p className="font-mono text-sm text-muted">
              {formatAmount(verdict.monto.base, DECIMALS)} {SYMBOL}
            </p>
          </div>

          {verdict.politica && (
            <p className="mt-3 font-mono text-sm">
              {verdict.politica} / {verdict.regla}
            </p>
          )}
          {verdict.politica && (
            <p className="text-sm text-muted">
              {policyNameEn(verdict.politica) ?? verdict.politica}
              {verdict.regla ? ` · ${ruleNameEn(verdict.regla) ?? verdict.regla}` : ''}
            </p>
          )}

          {verdict.razon && (
            <>
              <p className="mt-3 leading-relaxed">
                {reasonEn(verdict.politica ?? '', verdict.regla ?? '', verdict.razon) ?? verdict.razon}
              </p>
              <p className="mt-1 text-xs text-muted">
                <span className="uppercase tracking-wider">engine, verbatim:</span>{' '}
                <span lang="es">{verdict.razon}</span>
              </p>
            </>
          )}

          {verdict.traza && verdict.traza.length > 0 && (
            <p className="mt-3 font-mono text-xs text-muted">
              rules consulted: {verdict.traza.map((t) => `${t.policy_id}/${t.rule_name}`).join(' → ')}
            </p>
          )}

          <p className="mt-4 text-sm text-muted">
            {allowed
              ? 'Allowed — and still not sent. A verdict is not a transaction; this page has no endpoint that executes.'
              : 'Refused before a transaction existed. Nothing to undo, and no network was touched to say no.'}
          </p>
        </div>
      )}
    </div>
  )
}
