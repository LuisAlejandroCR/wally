'use client'

import { useState } from 'react'

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
 *   - it published a tunnel to one laptop, and a judge who pastes a dead URL
 *     blames the project rather than the tunnel. The engine is in the repository,
 *     so the panel hands over the repository instead: a clone answers forever and
 *     registers the same nine tools.
 */

type Transport = 'stdio' | 'http'

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

export function McpConnect () {
  const [transport, setTransport] = useState<Transport>('stdio')

  const stdio = JSON.stringify(
    { mcpServers: { cerrojo: { command: 'node', args: ['code/src/mcp/server.js'] } } },
    null,
    2
  )
  const http = JSON.stringify(
    { mcpServers: { cerrojo: { type: 'http', url: 'http://127.0.0.1:8788/mcp' } } },
    null,
    2
  )

  const TABS: { id: Transport; label: string; hint: string }[] = [
    { id: 'stdio', label: 'stdio', hint: 'Clone the repo and your client spawns the server itself.' },
    { id: 'http', label: 'Streamable HTTP', hint: 'Serve the same nine tools over HTTP on your own machine.' }
  ]

  return (
    <div className="space-y-4">
      {/* A pressed-button group rather than a tablist: this panel already sits
          inside the page's real tabs, and a second, incomplete tab pattern
          nested in the first is worse for a screen reader than none. */}
      <div className="inline-flex rounded-full border border-border bg-panel p-1" role="group" aria-label="Transport">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={transport === tab.id}
            onClick={() => setTransport(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              transport === tab.id ? 'bg-navy text-panel' : 'text-muted hover:text-navy'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        {TABS.find((tab) => tab.id === transport)!.hint} Drop it in, restart the client, and your agent is talking to
        the engine that judged every line on this page.
      </p>

      {transport === 'stdio' ? (
        <>
          <CodeBlock file=".mcp.json  ·  at the repository root" code={stdio} what="the stdio config" />
          <CodeBlock file="terminal  ·  first time only" code={'cd code && npm install'} what="the terminal commands" />
        </>
      ) : (
        <>
          <CodeBlock file="terminal  ·  serve it over HTTP yourself" code={'cd code && npm install\nnpm run mcp:http'} what="the terminal commands" />
          <CodeBlock file=".mcp.json  ·  or  claude_desktop_config.json" code={http} what="the HTTP config" />
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
    </div>
  )
}
