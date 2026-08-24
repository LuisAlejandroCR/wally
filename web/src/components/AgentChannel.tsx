import mcp from '@/data/mcp.json'
import tx from '@/data/live-tx.json'
import { Card, Note, Stat, StatRow } from '@/components/Page'
import { Help } from '@/components/Help'
import { McpConnect } from '@/components/McpConnect'
import { Amount } from '@/components/Receipt'

/**
 * The agent channel.
 *
 * The rest of the site shows a person driving the pipeline. This shows the same
 * pipeline with an agent on the other end of it, over MCP — and the argument is
 * carried by what is *missing* from the tool list, so the absent tools are drawn
 * as loudly as the present ones. Everything here is the server's own answer,
 * captured from a real session and kept in `data/mcp.json` unedited.
 *
 * It used to say all of that in prose: eleven cards, three sentences each, the
 * same claim made twice on two screens. The claim is a ratio, and a ratio is
 * better counted than described — so the overview counts it and the proof screen
 * tables it, both in the shapes the rest of the site already uses.
 */

const TOOLS = mcp.tools
const ABSENT = mcp.absent
const STEPS = mcp.transcript

const READS = TOOLS.filter((t) => t.readOnly)
const WRITES = TOOLS.filter((t) => !t.readOnly)

/**
 * The tool list as four numbers.
 *
 * The overview does not need the names; it needs the shape of the list, and the
 * last figure is the one worth reading twice. Same `Stat` the payroll totals use
 * two sections above, so the page counts things one way.
 */
export function AgentStats () {
  return (
    <StatRow>
      <Stat value={TOOLS.length} label="Tools" help="mcp" size="lg" delay={0} />
      <Stat value={READS.length} label="Read only" tone="text-blue" size="lg" delay={90} />
      <Stat value={WRITES.length} label="Write a file" tone="text-amber" help="tool-effect" size="lg" delay={180} />
      <Stat value={0} label="That can send" tone="text-green" help="voucher" size="lg" delay={270} />
    </StatRow>
  )
}

type Kind = 'read' | 'write' | 'absent'

const EFFECT: Record<Kind, { label: string; pill: string }> = {
  read: { label: 'reads', pill: 'border-border bg-panel-high text-muted' },
  write: { label: 'writes a file', pill: 'border-amber/40 bg-amber-bg text-amber' },
  absent: { label: 'never registered', pill: 'border-red/40 bg-red-bg text-red' }
}

/**
 * Every tool on one axis, including the two that do not exist.
 *
 * Putting the absent pair in the same table as the rest is the whole point: in a
 * separate grid they read as a footnote, and in the same column as `reads` and
 * `writes a file` they read as the end of a list that simply stops before the
 * thing you were looking for.
 */
export function AgentTools () {
  const rows: { name: string; label: string; body: string; kind: Kind }[] = [
    ...READS.map((t) => ({ name: t.name, label: t.label, body: t.body, kind: 'read' as const })),
    ...WRITES.map((t) => ({ name: t.name, label: t.label, body: t.body, kind: 'write' as const })),
    ...ABSENT.map((a) => ({ name: a.name, label: a.label, body: a.body, kind: 'absent' as const }))
  ]

  return (
    <div className="space-y-3">
      <div className="scroll-x rounded-xl border border-border bg-panel">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
              <th className="p-3 font-semibold">Tool</th>
              <th className="p-3 font-semibold">What it does</th>
              <th className="p-3 font-semibold">
                Effect
                <Help of="tool-effect" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const gone = r.kind === 'absent'
              return (
                <tr
                  key={r.name}
                  className={`row-in border-b border-border/60 align-top last:border-0 ${gone ? 'bg-red-bg/40' : ''}`}
                  style={{ animationDelay: `${Math.min(i * 45, 450)}ms` }}
                >
                  <td className="p-3">
                    <code
                      className={`font-mono text-xs font-semibold ${
                        gone ? 'text-red line-through decoration-2' : 'text-navy'
                      }`}
                    >
                      {r.name}
                    </code>
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{r.label}</span>
                    <div className="text-xs text-muted">{r.body}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${EFFECT[r.kind].pill}`}
                    >
                      {EFFECT[r.kind].label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const CHAIN = [
  {
    n: '01',
    who: 'The agent',
    what: 'proposes',
    help: undefined,
    body: 'Judged on the spot. A denied order never becomes a voucher.',
    tone: 'border-border bg-panel'
  },
  {
    n: '02',
    who: 'The voucher',
    what: 'waits',
    help: 'voucher' as const,
    body: 'Fifteen minutes, under a sha256 of the order.',
    tone: 'border-amber/40 bg-amber-bg'
  },
  {
    n: '03',
    who: 'A person',
    what: 'approves',
    help: 'revalidated' as const,
    body: 'Typed in a terminal the model cannot reach. The policies run again.',
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
          <h3 className="mt-2 text-xl font-bold">
            {s.who}
            {s.help && <Help of={s.help} />}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * The endpoint, spelled out so it can be copied.
 *
 * A transcript proves what happened once; a URL lets someone check for
 * themselves, which is a different and better thing to offer. Left open because
 * none of the nine tools can send, approve or read the seed.

export function RemoteEndpoint () {
  return <McpConnect url={mcp.remote.url} note={mcp.remote.note} />
}
*/
/**
 * The one live transfer.
 *
 * Everything else on this site is a decision with nothing broadcast behind it,
 * which is the point — and also the easiest thing in the world to disbelieve. So
 * the lock was opened once, deliberately, through the longest path in the system,
 * and the hash is here rather than described.
 */
export function LiveTransfer () {
  const url = `https://sepolia.etherscan.io/tx/${tx.txHash}`
  return (
    <div className="space-y-4">
      <div className="rise rounded-2xl border border-green/40 bg-green-bg p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="text-3xl font-bold tabular-nums text-green sm:text-4xl">
            <Amount base={tx.amountBase} decimals={tx.decimals} />{' '}
            <span className="text-base font-medium text-muted">{tx.symbol}</span>
          </div>
          <p className="text-sm text-muted">
            {tx.network} · block {tx.block.toLocaleString('en-US')} · fee {tx.feeWei} wei
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block break-all font-mono text-sm font-semibold text-blue hover:underline"
        >
          {tx.txHash} ↗
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tx.chain.map((s, i) => (
          <div key={s.who} className="rounded-xl border border-border bg-panel p-4">
            <span className="font-mono text-sm font-semibold text-blue">0{i + 1}</span>
            <p className="mt-1.5 text-sm font-semibold">
              {s.who} {s.did}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>
          </div>
        ))}
      </div>

      <Note>
        The command a person typed:{' '}
        <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-xs">{tx.command}</code>. The engine
        answered <strong>{tx.revalidated}</strong> again at approval
        <Help of="revalidated" />. It is the only transfer this treasury has ever made.
      </Note>
    </div>
  )
}

/**
 * One side of a call, with its role on the lid rather than in a caption above
 * it. The tone is the verdict, so the answer is readable before it is read.
 */
function Pane ({ lid, value, tone = 'plain' }: { lid: string; value: unknown; tone?: 'plain' | 'deny' | 'allow' }) {
  const shell =
    tone === 'deny'
      ? 'border-red/40'
      : tone === 'allow'
        ? 'border-green/40'
        : 'border-border'
  const head =
    tone === 'deny'
      ? 'border-red/40 bg-red-bg text-red'
      : tone === 'allow'
        ? 'border-green/40 bg-green-bg text-green'
        : 'border-border bg-panel text-muted'

  return (
    <div className={`overflow-hidden rounded-lg border ${shell}`}>
      <div className={`border-b px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] ${head}`}>
        {lid}
      </div>
      <pre className="scroll-x bg-panel-high p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

/**
 * The captured session. Three calls: refused by a cap, refused by the day's
 * counter, and the best thing an agent can get — a voucher.
 *
 * The JSON is the evidence and stays whole; everything that was wrapped around
 * it has been cut to a verdict pill and one line of reading, because a reader
 * who is looking at a `DENY` does not need a paragraph telling them it is one.
 */
export function McpTranscript () {
  return (
    <div className="space-y-4">
      {STEPS.map((s) => {
        const allowed = 'creado' in s.response && s.response.creado === true
        return (
          <Card key={s.step}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h3 className="text-lg font-bold">
                <span className="mr-2 font-mono text-sm font-semibold text-blue">0{s.step}</span>
                {s.title}
              </h3>
              <div className="flex items-center gap-2.5">
                <code className="font-mono text-xs text-muted">{s.tool}</code>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                    allowed ? 'border-green/40 bg-green-bg text-green' : 'border-red/40 bg-red-bg text-red'
                  }`}
                >
                  {allowed ? 'VOUCHER' : 'DENY'}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Pane lid="the agent sent" value={s.request} />
              <Pane lid="the server answered" value={s.response} tone={allowed ? 'allow' : 'deny'} />
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted">{s.reading}</p>
          </Card>
        )
      })}

      <Note>
        Captured {mcp.captured} against{' '}
        <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-xs">src/mcp/server.js</code>. The engine
        answers in Spanish; nothing here was rewritten.
      </Note>
    </div>
  )
}
