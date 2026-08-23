import recorded from '@/data/policies.json'
import { formatAmount, formatAmount2, liveApiUrl } from '@/lib/cerrojo'
import { policyNameEn, reasonEn, ruleNameEn } from '@/lib/english'

export const dynamic = 'force-dynamic'

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

/** Live when the deployment has an engine URL; otherwise the recorded response. */
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

export default async function PoliciesPage () {
  const { data, live } = await loadPolicies()

  const caps = [
    { label: 'Per-transfer cap', value: data.topePorTransferencia, unit: data.token.symbol },
    { label: 'Daily cap', value: data.topeDiario, unit: data.token.symbol }
  ]

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">The lock, in five policies</h1>
        <p className="max-w-3xl text-lg text-muted">
          Registered with WDK before any account exists, so the write path cannot be reached without going through
          the engine. Each rule carries the reason that lands, word for word, on the line it denied.
        </p>
        <p className="text-sm text-muted">
          {live ? 'Read live from the engine.' : 'Recorded from the engine.'}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {caps.map((c) => (
          <div key={c.label} className="rise rounded-xl border border-border bg-panel p-5">
            <div className="text-3xl font-bold tabular-nums" title={`${formatAmount(c.value.base, data.token.decimals)} ${c.unit}`}>
              {formatAmount2(c.value.base, data.token.decimals)}{' '}
              <span className="text-base font-medium text-muted">{c.unit}</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted">{c.label}</div>
            <div className="mt-2 font-mono text-xs text-muted">{c.value.base} base units</div>
          </div>
        ))}
        <div className="rise rounded-xl border border-border bg-panel p-5">
          <div className="text-3xl font-bold tabular-nums">{data.destinatariosPermitidos}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">Allowed recipients</div>
          <div className="mt-2 font-mono text-xs text-muted">
            {data.red} · {data.token.symbol} {data.token.address.slice(0, 10)}…
          </div>
        </div>
      </section>

      <section className="space-y-4">
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
                                <span className="mt-1 block text-xs text-muted">
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
        <p className="text-sm text-muted">
          The daily cap keeps its own counter: <code className="font-mono">rule.onSuccess</code> is in the WDK schema
          but ignored at runtime in 1.0.0-beta.16, so delegating it would have been a lock that does not close.
        </p>
      </section>
    </div>
  )
}
