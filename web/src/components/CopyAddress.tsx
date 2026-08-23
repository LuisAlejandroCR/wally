'use client'

import { useState } from 'react'
import { shortAddress } from '@/lib/cerrojo'

/**
 * A recipient address: short on screen, whole on the clipboard.
 *
 * It is deliberately not a link. Nothing was broadcast in a dry run and the
 * payroll rows are synthetic, so an explorer has no entry for any of them —
 * sending a reader to an empty page reads as a broken demo. Copying the value
 * is the thing someone actually wants to do with an address.
 */
export function CopyAddress ({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false)

  if (!address) return <span className="font-mono text-xs text-muted">—</span>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard denied by the browser: the full value is still in the title.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`${address} — click to copy`}
      className="group inline-flex items-center gap-1.5 rounded font-mono text-xs text-foreground transition-colors hover:text-navy"
    >
      {shortAddress(address)}
      <span
        aria-hidden="true"
        className={`text-[0.65rem] uppercase tracking-wider ${copied ? 'text-green' : 'text-muted opacity-0 transition-opacity group-hover:opacity-100'}`}
      >
        {copied ? 'copied' : 'copy'}
      </span>
      <span className="sr-only">{copied ? 'address copied' : 'copy full address'}</span>
    </button>
  )
}
