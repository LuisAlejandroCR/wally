import clean from '@/data/run-clean.json'
import type { Receipt } from '@/lib/cerrojo'
import { LockFlow } from '@/components/LockFlow'
import { Explainer } from '@/components/Explainer'
import { AgentTools, LiveTransfer, VoucherChain } from '@/components/AgentChannel'
import { Amount } from '@/components/Receipt'
import { Card, Cta, NextSteps, Note, Page, PageHeader, Section } from '@/components/Page'

const receipt = clean as unknown as Receipt
const t = receipt.totals

/** A number nobody has to squint at. The label says what it is; the tone says how it went. */
function BigNumber ({
  value,
  label,
  tone,
  delay = 0
}: {
  value: number | string
  label: string
  tone: string
  delay?: number
}) {
  return (
    <div className="count-in rise rounded-xl border border-border bg-panel p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className={`text-4xl font-bold tabular-nums sm:text-5xl ${tone}`}>{value}</div>
      <div className="mt-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</div>
    </div>
  )
}

/**
 * The headline arrives a word at a time.
 *
 * The space lives between the spans, never inside one: a word is
 * `display: inline-block`, and a browser trims whitespace at the end of an
 * inline-block, which glues the whole sentence together.
 */
function Headline ({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(' ')
  return (
    <>
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span className="word" style={{ animationDelay: `${from + i * 85}ms` }}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  )
}

// The argument in three lines. The cartoon above tells the same story with
// pictures, so this is a reminder, not a second telling.
const ARGUMENT = [
  'An agent reads a payroll faster than we do.',
  'A payroll can argue back — one cell is enough.',
  'A limit in a prompt is a request. In code, it is a control.'
]

const LAYERS = [
  { layer: 'AI', role: 'proposes', body: 'A schema-validated plan. No key, no transfer, no sign.' },
  { layer: 'Cerrojo', role: 'decides', body: 'Five offline rules and a daily counter. Refusing costs no network.' },
  { layer: 'WDK', role: 'executes', body: 'Default-deny wallet. Only authorised lines reach it.' }
]

export default function Home () {
  return (
    <Page>
      <PageHeader
        size="hero"
        eyebrow="Aleph Hackathon 2026 · WDK Track"
        title={
          <>
            <Headline text="AI can propose payments." from={120} />{' '}
            <em>
              <Headline text="It can’t decide where your money goes." from={480} />
            </em>
          </>
        }
        lead="The limits live in the Tether WDK policy engine, out of the model’s reach."
        actions={
          <>
            <Cta href="/operator" tone="primary">
              Run the live demo →
            </Cta>
            <Cta href="/proof">Read the receipt</Cta>
          </>
        }
      />

      <div className="-mt-4">
        <Explainer approved={t.ejecutadas} blocked={t.denegadas} notAttempted={t.no_intentadas} lines={t.lineas} />
      </div>

      <Section tone="panel">
        <div className="grid gap-4 sm:grid-cols-3">
          {ARGUMENT.map((line, i) => (
            <p key={line} className="text-base leading-snug">
              <span className="mr-2 font-mono text-sm font-semibold text-blue">0{i + 1}</span>
              {line}
            </p>
          ))}
        </div>
      </Section>

      <Section
        title={`One payroll, ${t.lineas} lines`}
        aside={`Dry run on ${receipt.run.network} · every figure from the receipt`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BigNumber value={t.lineas} label="Analysed" tone="text-foreground" delay={0} />
          <BigNumber value={t.ejecutadas} label="Approved" tone="text-green" delay={90} />
          <BigNumber value={t.denegadas} label="Blocked" tone="text-red" delay={180} />
          <BigNumber value={t.no_intentadas} label="Not attempted" tone="text-amber" delay={270} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rise rounded-xl border border-green/40 bg-green-bg p-5">
            <div className="text-2xl font-bold tabular-nums text-green">
              <Amount base={t.montoEjecutado} decimals={t.decimals} />{' '}
              <span className="text-base font-medium text-muted">USDT</span>
            </div>
            <p className="mt-1 text-sm text-muted">authorised</p>
          </div>
          <div className="rise rounded-xl border border-red/40 bg-red-bg p-5">
            <div className="text-2xl font-bold tabular-nums text-red">
              <Amount base={t.montoDenegado} decimals={t.decimals} />{' '}
              <span className="text-base font-medium text-muted">USDT</span>
            </div>
            <p className="mt-1 text-sm text-muted">stopped before a transaction existed</p>
          </div>
        </div>
      </Section>

      <Section title="Three layers. Only one decides." className="scroll-mt-24">
        <div id="how-it-works" className="scroll-mt-24" />
        <div className="grid gap-4 sm:grid-cols-3">
          {LAYERS.map((l, i) => (
            <Card key={l.layer}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm font-semibold text-blue">0{i + 1}</span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted">{l.role}</span>
              </div>
              <h3 className="mt-2 text-xl font-bold">{l.layer}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{l.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title={
          <>
            Manipulate the agent. <em>The lock still holds.</em>
          </>
        }
        lead={`Same payroll, three cells rewritten to attack the model. Identical verdict on all ${t.lineas} lines.`}
      >
        <LockFlow verdict="blocked" />
      </Section>

      <Section
        id="agent"
        eyebrow="The agent channel · MCP"
        title={
          <>
            Give the agent a wallet. <em>Don’t give it a key.</em>
          </>
        }
        lead="Cerrojo is also an MCP server. Point Claude Code or Claude Desktop at it and the agent gets nine tools over stdio — none of which can move a cent."
        className="scroll-mt-24"
      >
        <AgentTools />

        <h3 className="pt-3 text-lg font-bold">So the most an agent can do is ask</h3>
        <VoucherChain />
        <Note>
          That asymmetry is the safety model: the channel that proposes and the channel that approves are different
          programs, and only one of them has a person in it. A prompt cannot pay itself.
        </Note>
        <Cta href="/proof#agent">Read a real MCP session →</Cta>
      </Section>

      <Section
        tone="panel"
        eyebrow="On chain · Sepolia"
        title={
          <>
            And once, <em>a person said yes.</em>
          </>
        }
        lead="A lock that has never opened is not a lock anyone should believe in. So it was opened exactly once, through the longest path in the system, and here is the hash."
      >
        <LiveTransfer />
      </Section>

      <Section
        tone="panel"
        eyebrow="Built on Tether WDK"
        title="WDK holds the wallet. Cerrojo controls what reaches it."
      >
        <Note>
          <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">cerrojo paridad</code> hands
          Tether&apos;s own <code className="rounded bg-panel-high px-1.5 py-0.5 font-mono text-sm">wdk</code> CLI only
          approved lines. That CLI has no cap and no allowlist — which is why the lock sits in front of it.
        </Note>
        <a
          className="inline-block font-semibold text-blue hover:underline"
          href="https://github.com/LuisAlejandroCR/wally#wdk-integration"
          target="_blank"
          rel="noreferrer"
        >
          Every line where WDK is called ↗
        </a>
      </Section>

      <NextSteps>
        <Cta href="/proof#injection" tone="primary">
          See the injection test →
        </Cta>
        <Cta href="/proof#policies">The five policies</Cta>
      </NextSteps>
    </Page>
  )
}
