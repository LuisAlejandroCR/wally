'use client'

import { useEffect, useState } from 'react'

/**
 * Connecting your own agent, in the two ways it is actually done.
 *
 * The panel this replaces printed one JSON block and asked the reader to select
 * it by hand. Three things were wrong with that, and each is fixed here:
 *
 *   - it claimed stdio in the prose and then showed an HTTP config, so whichever
 *     client the reader had, the snippet was for the other one. Both are here now,
 *     one click apart, each with the file it goes in named on it;
 *   - a config is meant to be copied, so it copies;
 *   - the remote endpoint is a tunnel to one laptop, and a judge who pastes a
 *     dead URL blames the project rather than the tunnel. So the page asks the
 *     endpoint whether it is up, in the browser, and says what it found —
 *     including when the answer is no.
 *
 * The probe hits the endpoint's own card at `/`, which is a plain GET that
 * returns what the server is and how many tools it registered. It cannot be
 * used to move anything, because nothing here can.
 */

type Transport = 'remote' | 'local'

/** The card `src/mcp/http.js` serves at `/` to anyone who opens the URL. */
interface Card {
  servicio: string
  herramientas: number
  red: string
  puede_enviar: boolean
  puede_aprobar: boolean
}

type Probe =
  | { state: 'checking' }
  | { state: 'up'; card: Card; ms: number }
  | { state: 'down' }

/**
 * Copy-to-clipboard, sized for a block of config rather than one address.
 *
 * `what` names the thing being copied for a screen reader, because "Copy" three
 * times on one panel tells a listener nothing about which is which.
 */
function CopyButton ({ text, what, label = 'Copy' }: { text: string; what: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked: the text is on screen and selectable either way.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${what} copied to clipboard` : `Copy ${what}`}
      className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
        copied
          ? 'border-green/50 bg-green-bg text-green'
          : 'border-border bg-panel text-muted hover:border-border-strong hover:text-navy'
      }`}
    >
      <span aria-hidden="true">{copied ? 'Copied' : label}</span>
    </button>
  )
}

/** A block of code with the file it belongs in on the lid, and a copy button. */
function CodeBlock ({ file, code, what }: { file: string; code: string; what: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-3 py-2">
        <code className="truncate font-mono text-xs text-muted">{file}</code>
        <CopyButton text={code} what={what} />
      </div>
      <pre className="scroll-x bg-panel-high p-3.5 font-mono text-xs leading-relaxed">{code}</pre>
    </div>
  )
}

/**
 * Whether the tunnel is answering right now.
 *
 * Deliberately client-side: a server-rendered check would report how the
 * endpoint looked when the page was built, which is exactly the stale claim this
 * is here to stop making.
 */
function useProbe (url: string): Probe {
  const [probe, setProbe] = useState<Probe>({ state: 'checking' })

  useEffect(() => {
    const control = new AbortController()
    const started = performance.now()
    const timer = window.setTimeout(() => control.abort(), 6000)

    fetch(new URL('/', url).toString(), { signal: control.signal, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Card>) : Promise.reject(new Error('not ok'))))
      .then((card) => setProbe({ state: 'up', card, ms: Math.round(performance.now() - started) }))
      .catch(() => setProbe({ state: 'down' }))
      .finally(() => window.clearTimeout(timer))

    return () => {
      window.clearTimeout(timer)
      control.abort()
    }
  }, [url])

  return probe
}

/** The live badge. It says what was found, including when nothing was. */
function Status ({ probe }: { probe: Probe }) {
  const shell =
    probe.state === 'up'
      ? 'border-green/50 bg-green-bg text-green'
      : probe.state === 'down'
        ? 'border-amber/50 bg-amber-bg text-amber'
        : 'border-border bg-panel text-muted'

  const dot =
    probe.state === 'up' ? 'bg-green' : probe.state === 'down' ? 'bg-amber' : 'bg-muted'

  const text =
    probe.state === 'up'
      ? `Answering · ${probe.card.herramientas} tools · ${probe.card.red} · ${probe.ms} ms`
      : probe.state === 'down'
        ? 'Not answering right now — run it locally instead'
        : 'Checking the endpoint…'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${shell}`}
      role="status"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot} ${probe.state === 'checking' ? 'animate-pulse' : ''}`} />
      {text}
    </span>
  )
}

export function McpConnect ({ url, note }: { url: string; note: string }) {
  const probe = useProbe(url)

  // Null means "nobody has clicked yet", which is what lets a dead endpoint
  // move the panel to the local transport on its own — derived from the probe
  // rather than pushed into state by an effect. Once a reader picks a tab, their
  // choice outranks the probe and stays put.
  const [chosen, setChosen] = useState<Transport | null>(null)
  const transport: Transport = chosen ?? (probe.state === 'down' ? 'local' : 'remote')

  const remote = JSON.stringify({ mcpServers: { cerrojo: { type: 'http', url } } }, null, 2)
  const local = JSON.stringify(
    { mcpServers: { cerrojo: { command: 'node', args: ['code/src/mcp/server.js'] } } },
    null,
    2
  )

  const TABS: { id: Transport; label: string; hint: string }[] = [
    { id: 'remote', label: 'Remote · HTTP', hint: 'Nothing to install. Points at a running engine.' },
    { id: 'local', label: 'Local · stdio', hint: 'Clone the repo and your client spawns the server itself.' }
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* A pressed-button group rather than a tablist: this panel already sits
            inside the page's real tabs, and a second, incomplete tab pattern
            nested in the first is worse for a screen reader than none. */}
        <div className="inline-flex rounded-full border border-border bg-panel p-1" role="group" aria-label="Transport">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={transport === tab.id}
              onClick={() => setChosen(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                transport === tab.id ? 'bg-navy text-panel' : 'text-muted hover:text-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {transport === 'remote' && <Status probe={probe} />}
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        {TABS.find((tab) => tab.id === transport)!.hint} Drop it in, restart the client, and your agent is talking to
        the engine that judged every line on this page.
      </p>

      {transport === 'remote' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">endpoint</span>
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-navy">{url}</code>
            <CopyButton text={url} what="the endpoint URL" label="Copy URL" />
          </div>
          <CodeBlock file=".mcp.json  ·  or  claude_desktop_config.json" code={remote} what="the HTTP config" />
          {probe.state === 'down' && (
            <p className="rounded-xl border border-amber/40 bg-amber-bg p-4 text-sm leading-relaxed">
              The endpoint did not answer. It is a tunnel to one laptop and it rotates — the engine itself is in the
              repository, so switch to <strong>Local · stdio</strong> and you get the same tools with nothing missing.
            </p>
          )}
        </>
      ) : (
        <>
          <CodeBlock file=".mcp.json  ·  at the repository root" code={local} what="the stdio config" />
          <CodeBlock file="terminal  ·  or serve it over HTTP yourself" code={'cd code && npm install\nnpm run mcp:http'} what="the terminal commands" />
        </>
      )}

      <div className="rounded-xl border border-gold/50 bg-gold-bg p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">then ask it</p>
        <p className="mt-1.5 text-sm italic leading-relaxed">
          &ldquo;Using the cerrojo tools: send 900 USDT to 0x…dEaD.&rdquo;
        </p>
        <p className="mt-2 text-sm text-muted">
          It comes back <strong className="text-red">DENY</strong>, by rule name. Insist, and it still cannot: there is
          no tool that sends.
        </p>
      </div>

      <p className="text-sm text-muted">{note}</p>
    </div>
  )
}
