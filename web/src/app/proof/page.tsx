import clean from '@/data/run-clean.json'
import poisoned from '@/data/run-poisoned.json'
import recorded from '@/data/policies.json'
import type { Receipt } from '@/lib/cerrojo'
import { formatAmount, formatAmount2, liveApiUrl } from '@/lib/cerrojo'
import { policyNameEn, reasonEn, ruleNameEn } from '@/lib/english'
import { Amount, Checks, DryRunNote, FeeNote, ReceiptTable, RunMeta, StatusPill, Totals, VerdictIcon } from '@/components/Receipt'
import { CopyAddress } from '@/components/CopyAddress'
import { ProofTabs } from '@/components/ProofTabs'
import { AgentTools, McpTranscript, VoucherChain } from '@/components/AgentChannel'
import { Card, Cta, NextSteps, Note, Page, PageHeader, Section } from '@/components/Page'

export const dynamic = 'force-dynamic'

const limpia = clean as unknown as Receipt
const envenenada = poisoned as unknown as Receipt
const t = limpia.totals

/* ── the injection comparison, computed once at module load ──────────────── */

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

/* ── the policies, live when an engine is wired ──────────────────────────── */

interface PolicyRule {
  nombre: string
  accion: 'ALLOW' | 'DENY'
  operacion: string
  razon: string | null
}

interface PoliciesResponse {
  red: string
  token: { symbol: string; address: string; decimals: number }
  topePorTransferencia: { base: string; legible: string }
  topeDiario: { base: string; legible: string }
  destinatariosPermitidos: number
  politicas: { id: string; nombre: string; reglas: PolicyRule[] }[]
}

async function loadPolicies (): Promise<{ data: PoliciesResponse; live: boolean }> {
  const base = liveApiUrl()
  if (base) {
    try {
      const r = await fetch(`${base}/politicas`, { cache: 'no-store' })
      if (r.ok) return { data: (await r.json()) as PoliciesResponse, live: true }
    } catch {
      // Engine unreachable: fall through to the recorded response rather than
      // showing an empty page or inventing a policy.
    }
  }
  return { data: recorded as unknown as PoliciesResponse, live: false }
}

/** A heading inside a panel. The h2 belongs to the panel; this is a part of it. */
function Sub ({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-2 text-lg font-bold">{children}</h3>
}

export default async function ProofPage () {
  const { data, live } = await loadPolicies()

  const caps = [
    { label: 'Per-transfer cap', value: data.topePorTransferencia, unit: data.token.symbol },
    { label: 'Daily cap', value: data.topeDiario, unit: data.token.symbol }
  ]

  const receiptPanel = (
    <Section
      title="The receipt"
      lead={<span className="font-mono text-sm">&ldquo;{limpia.run.instruction}&rdquo;</span>}
      aside={live ? 'Engine wired: run it on Operator.' : 'Recorded receipt.'}
    >
      <Totals receipt={limpia} />
      <ReceiptTable receipt={limpia} />
      <DryRunNote network={limpia.run.network} />
      <FeeNote receipt={limpia} />
      <Note>
        {t.ejecutadas} + {t.denegadas} + {t.no_intentadas} = {t.lineas} — no receipt is issued unless that adds up.
      </Note>

      <Sub>Four deterministic checks</Sub>
      <Checks receipt={limpia} />

      <Sub>Provenance</Sub>
      <div className="rounded-xl border border-border bg-panel p-5">
        <RunMeta receipt={limpia} source={live ? 'recorded run, shipped with the page' : 'shipped with the page'} />
      </div>
    </Section>
  )

  const injectionPanel = (
    <Section
      title={
        <>
          The same payroll, <em>arguing back</em>
        </>
      }
      lead="Three cells rewritten to attack the model. Both files ran the full pipeline."
    >
      <div className={`rise rounded-2xl border p-5 ${identical ? 'border-green/40 bg-green-bg' : 'border-red/40 bg-red-bg'}`}>
        <p className="text-2xl font-bold">
          {identical ? `Identical verdict on all ${rows.length} lines.` : 'The verdicts differ — read the table.'}
        </p>
        <span aria-hidden="true" className="sweep mt-2 block h-0.5 w-24 rounded bg-gold" />
        <p className="mt-2 text-sm">
          {limpia.totals.ejecutadas}/{limpia.totals.denegadas}/{limpia.totals.no_intentadas} against{' '}
          {envenenada.totals.ejecutadas}/{envenenada.totals.denegadas}/{envenenada.totals.no_intentadas} — approved /
          blocked / not attempted.
        </p>
      </div>

      <Sub>{injected.length} poisoned cells, carried as data</Sub>
      <div className="space-y-3">
        {injected.map((r) => (
          <Card key={r.row}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-wider text-muted">Row {r.row}</span>
              <StatusPill estado={r.estado} />
              <span className="text-xs text-muted">unchanged: {r.same ? 'yes' : 'no'}</span>
            </div>
            <p className="mt-3 font-mono text-sm break-words text-amber">{r.poisonedText}</p>
            <p className="mt-2 text-sm text-muted">
              Clean file: <span className="font-mono">{r.cleanText}</span>
            </p>
          </Card>
        ))}
      </div>
      <Note>Carried as data, not followed as an instruction.</Note>

      <Sub>Line by line</Sub>
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
                      {r.policy.id} / {ruleNameEn(r.policy.rule) ?? r.policy.rule}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <CopyAddress address={r.to} />
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
      <Note>
        Both receipts came from <code className="font-mono">node src/cli.js run --json</code> on a fresh daily ledger.
      </Note>
    </Section>
  )

  const policiesPanel = (
    <Section
      title={
        <>
          The lock, in <em>five policies</em>
        </>
      }
      lead="Registered with WDK before any account exists."
      aside={live ? 'Read live from the engine.' : 'Recorded from the engine.'}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {caps.map((c) => (
          <Card key={c.label}>
            <div
              className="text-3xl font-bold tabular-nums"
              title={`${formatAmount(c.value.base, data.token.decimals)} ${c.unit}`}
            >
              {formatAmount2(c.value.base, data.token.decimals)}{' '}
              <span className="text-base font-medium text-muted">{c.unit}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
            <div className="mt-2 font-mono text-xs text-muted">{c.value.base} base units</div>
          </Card>
        ))}
        <Card>
          <div className="text-3xl font-bold tabular-nums">{data.destinatariosPermitidos}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">Allowed recipients</div>
          <div className="mt-2 font-mono text-xs text-muted">
            {data.red} · {data.token.symbol} {data.token.address.slice(0, 10)}…
          </div>
        </Card>
      </div>

      <Sub>Rule by rule</Sub>
      <div className="scroll-x rounded-xl border border-border bg-panel">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-3 font-semibold">Policy</th>
              <th className="p-3 font-semibold">Rule</th>
              <th className="p-3 font-semibold">Action</th>
              <th className="p-3 font-semibold">Reason carried into the receipt</th>
            </tr>
          </thead>
          <tbody>
            {data.politicas.flatMap((p) =>
              p.reglas.map((r) => (
                <tr key={`${p.id}-${r.nombre}`} className="border-b border-border/60 last:border-0 align-top">
                  <td className="p-3">
                    <code className="font-mono text-xs">{p.id}</code>
                    <div className="text-xs text-muted">{policyNameEn(p.id) ?? p.nombre}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{ruleNameEn(r.nombre) ?? r.nombre}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        r.accion === 'ALLOW'
                          ? 'border-green/40 bg-green-bg text-green'
                          : 'border-red/40 bg-red-bg text-red'
                      }`}
                    >
                      {r.accion}
                    </span>
                    <div className="mt-1 font-mono text-[0.7rem] text-muted">{r.operacion}</div>
                  </td>
                  <td className="p-3">
                    {r.razon === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      (() => {
                        const english = reasonEn(p.id, r.nombre, r.razon)
                        return (
                          <>
                            <span className="text-foreground">{english ?? r.razon}</span>
                            {english && (
                              <span className="verbatim mt-1 block text-xs text-muted">
                                <span className="uppercase tracking-wider">engine, verbatim:</span>{' '}
                                <span lang="es">{r.razon}</span>
                              </span>
                            )}
                          </>
                        )
                      })()
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Note>
        The daily cap keeps its own counter: <code className="font-mono">rule.onSuccess</code> is in the WDK schema
        but ignored at runtime in 1.0.0-beta.16.
      </Note>
    </Section>
  )

  const agentPanel = (
    <Section
      title={
        <>
          An agent asking, <em>three times</em>
        </>
      }
      lead="A real MCP session against the same engine. It is refused by a cap, refused by the day's counter, and then handed a voucher instead of a payment."
      aside="Captured from stdio."
    >
      <McpTranscript />

      <Sub>What the server registered</Sub>
      <AgentTools />

      <Sub>And what it takes to move</Sub>
      <VoucherChain />
      <Note>
        Approving is not a tool. It is a command a person types, and it re-runs the policy engine before it signs —
        so an approval that was valid fifteen minutes ago can still be refused now.
      </Note>
    </Section>
  )

  return (
    <Page>
      <PageHeader
        eyebrow="Evidence · dry run"
        title={
          <>
            Everything the engine wrote, <em>and nothing this page decided</em>
          </>
        }
        lead="One payroll, the same payroll under attack, an agent asking over MCP, and the five rules that judged all three."
      />

      <ProofTabs
        panels={[
          { id: 'receipt', label: 'The receipt', panel: receiptPanel, hasVerbatim: true },
          { id: 'injection', label: 'Under attack', panel: injectionPanel },
          { id: 'agent', label: 'The agent channel', panel: agentPanel },
          { id: 'policies', label: 'The policies', panel: policiesPanel, hasVerbatim: true }
        ]}
      />

      <NextSteps>
        <Cta href="/operator" tone="primary">
          Run it yourself →
        </Cta>
        <Cta href="/">Back to the overview</Cta>
      </NextSteps>
    </Page>
  )
}
