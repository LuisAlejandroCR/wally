'use client'

import { useState } from 'react'
import { INPUTS, fileSize, type InputName } from '@/lib/inputs'

/**
 * The input file, attached rather than named.
 *
 * The receipt records its input as an absolute path on the machine that ran it
 * -- `C:\Users\...\evals\fixtures\nomina_agosto.csv`. A reader can do nothing
 * with that except take our word for it, and it publishes a home directory
 * besides.
 *
 * So the file travels with the site: openable in place, downloadable, and shown
 * with the sha256 of the bytes actually being served. The hash is computed at
 * build time from the same file the engine read, which means it is checkable --
 * and if the fixture ever drifts from the recorded run, the two hashes stop
 * agreeing in public instead of quietly staying friends.
 *
 * The lookups it needs live in `lib/inputs`, importable from a server component;
 * this file is the drawing only.
 */

function PaperClip () {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.5 4 4.9 8.6a2.2 2.2 0 0 0 3.1 3.1l5-5a3.7 3.7 0 0 0-5.2-5.2l-5 5a5.2 5.2 0 0 0 7.4 7.4L14 10" />
    </svg>
  )
}

export function FileAttachment ({
  name,
  expects
}: {
  name: InputName
  /** The sha256 the receipt claims for this input, if there is one to check. */
  expects?: string
}) {
  const [open, setOpen] = useState(false)
  const file = INPUTS[name]
  const matches = expects === undefined || expects === file.sha256
  const lines = file.text.replace(/\n$/, '').split('\n')

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <span className="text-muted">
          <PaperClip />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm font-semibold text-navy">{file.name}</span>
          <span className="block text-xs text-muted">
            {file.role} · {fileSize(file.bytes)} · {lines.length} lines
          </span>
        </span>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-lg border border-border bg-panel px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-navy"
        >
          {open ? 'Hide' : 'Open'}
        </button>
        <a
          href={`/inputs/${file.name}`}
          download={file.name}
          className="rounded-lg border border-border bg-panel px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-navy"
        >
          Download
        </a>
      </div>

      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2 text-xs ${
          matches ? 'border-border bg-panel-high' : 'border-red/40 bg-red-bg'
        }`}
      >
        <span className="font-semibold uppercase tracking-wider text-muted">sha256</span>
        <code className="min-w-0 flex-1 break-all font-mono text-muted">{file.sha256}</code>
        {expects !== undefined && (
          <span className={`font-semibold ${matches ? 'text-green' : 'text-red'}`}>
            {matches ? '✓ matches the receipt' : '✗ differs from the receipt'}
          </span>
        )}
      </div>

      {open && (
        <div className="scroll-x max-h-80 overflow-y-auto border-t border-border">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="w-10 select-none border-r border-border/50 bg-panel-high px-2 py-1 text-right text-muted tabular-nums">
                    {i + 1}
                  </td>
                  <td className="whitespace-pre px-3 py-1">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
