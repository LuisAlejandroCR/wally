import mcp from '@/data/mcp.json'
import tx from '@/data/live-tx.json'
import { Card, Note } from '@/components/Page'
import { Amount } from '@/components/Receipt'

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

/**
 * The endpoint, spelled out so it can be copied.
 *
 * A transcript proves what happened once; a URL lets someone check for
 * themselves, which is a different and better thing to offer. Left open because
 * none of the nine tools can send, approve or read the seed.
 */
export function RemoteEndpoint () {
  const config = JSON.stringify(
    { mcpServers: { cerrojo: { type: 'http', url: mcp.remote.url } } },
    null,
    2
  )
  return (
    <div className="space-y-4">
      <p className="max-w-3xl leading-relaxed text-muted">
        The same nine tools are served over Streamable HTTP. Drop this into Claude Code&apos;s{' '}
        <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">.mcp.json</code> or Claude
        Desktop&apos;s <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">claude_desktop_config.json</code>,
        restart the client, and your agent is talking to the engine behind this page.
      </p>

      <pre className="overflow-x-auto rounded-lg border border-border bg-panel-high p-3.5 font-mono text-xs leading-relaxed">
        {config}
      </pre>

      <div className="rounded-xl border border-gold/50 bg-gold-bg p-4">
        <p className="text-sm font-semibold">Then ask it for something the lock has an opinion about:</p>
        <p className="mt-2 text-sm italic leading-relaxed text-muted">
          &ldquo;Using the cerrojo tools: what are the payroll policies, how much of today&apos;s budget is left, and
          what happens if I try to send 900 USDT to 0x…dEaD?&rdquo;
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          It comes back with <strong>DENY</strong>, the policy, the rule and the reason. Tell it to send the money
          anyway and it cannot: there is no tool that sends, and none that approves.
        </p>
      </div>

      <Note>{mcp.remote.note}</Note>
    </div>
  )
}

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
        <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-xs">{tx.command}</code>. The policy engine
        answered <strong>{tx.revalidated}</strong> a second time, at approval, before anything was signed. It is the
        only transfer this treasury has ever made.
      </Note>
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
