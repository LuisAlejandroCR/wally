import mcp from '@/data/mcp.json'
import { Card, Note } from '@/components/Page'

/**
 * The agent channel.
 *
 * The rest of the site shows a person driving the pipeline. This shows the same
 * pipeline with an agent on the other end of it, over MCP — and the argument is
 * carried by what is *missing* from the tool list, so the absent tools are drawn
 * as loudly as the present ones. Everything here is the server's own answer,
 * captured from a real stdio session and kept in `data/mcp.json` unedited.
 */

const TOOLS = mcp.tools
const ABSENT = mcp.absent
const STEPS = mcp.transcript

/** One tool the agent actually gets. */
function Tool ({ name, label, body, readOnly }: (typeof TOOLS)[number]) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <code className="break-all font-mono text-sm font-semibold text-navy">{name}</code>
        {readOnly && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            read only
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  )
}

/** A tool that does not exist, drawn so that its absence is the point. */
function Absent ({ name, body }: (typeof ABSENT)[number]) {
  return (
    <div className="rounded-xl border border-dashed border-red/50 bg-red-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <code className="break-all font-mono text-sm font-semibold text-red line-through decoration-2">{name}</code>
        <span className="shrink-0 rounded-full border border-red/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red">
          no such tool
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  )
}

/** The nine tools the agent gets, and the two it does not. */
export function AgentTools () {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Tool key={t.name} {...t} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ABSENT.map((a) => (
          <Absent key={a.name} {...a} />
        ))}
      </div>

      <Note>
        {TOOLS.length} tools over stdio, {TOOLS.filter((t) => t.readOnly).length} of them read-only. The two that would
        move money are not in the list — and an MCP client can only call what the server registered.
      </Note>
    </div>
  )
}

const CHAIN = [
  {
    n: '01',
    who: 'The agent',
    what: 'proposes',
    body: 'It calls cerrojo_proponer_pago. The policy engine judges the order there and then; a denied order never becomes a voucher.',
    tone: 'border-border bg-panel'
  },
  {
    n: '02',
    who: 'The voucher',
    what: 'waits',
    body: 'Fifteen minutes, and a sha256 of the order. The amount and the recipient cannot change between the proposal and the signature.',
    tone: 'border-amber/40 bg-amber-bg'
  },
  {
    n: '03',
    who: 'A person',
    what: 'approves',
    body: 'cerrojo aprobar <id> --live --confirmo, typed in a terminal the model cannot reach. The policies run again before anything is signed.',
    tone: 'border-green/40 bg-green-bg'
  }
]

/** Propose → wait → approve. The asymmetry, in three cards. */
export function VoucherChain () {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CHAIN.map((s) => (
        <div key={s.n} className={`rise rounded-xl border p-5 ${s.tone}`}>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold text-blue">{s.n}</span>
            <span className="font-mono text-xs uppercase tracking-wider text-muted">{s.what}</span>
          </div>
          <h3 className="mt-2 text-xl font-bold">{s.who}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

/** A block of JSON, monospaced and scrollable rather than wrapped into soup. */
function Json ({ value, tone = 'plain' }: { value: unknown; tone?: 'plain' | 'deny' | 'allow' }) {
  const shell =
    tone === 'deny'
      ? 'border-red/40 bg-red-bg'
      : tone === 'allow'
        ? 'border-green/40 bg-green-bg'
        : 'border-border bg-panel-high'
  return (
    <pre className={`overflow-x-auto rounded-lg border p-3.5 font-mono text-xs leading-relaxed ${shell}`}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/**
 * The captured session, verbatim. Three calls: refused by a cap, refused by the
 * day's counter, and the best thing an agent can get — a voucher.
 */
export function McpTranscript () {
  return (
    <div className="space-y-5">
      {STEPS.map((s) => {
        const allowed = 'creado' in s.response && s.response.creado === true
        return (
          <Card key={s.step}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-bold">
                <span className="mr-2 font-mono text-sm font-semibold text-blue">0{s.step}</span>
                {s.title}
              </h3>
              <code className="font-mono text-xs text-muted">{s.tool}</code>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">the agent sent</p>
                <Json value={s.request} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">the server answered</p>
                <Json value={s.response} tone={allowed ? 'allow' : 'deny'} />
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted">{s.reading}</p>
          </Card>
        )
      })}

      <Note>
        Captured {mcp.captured} from a real stdio session against{' '}
        <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">src/mcp/server.js</code>. The engine
        answers in Spanish; nothing here was rewritten.
      </Note>
    </div>
  )
}
