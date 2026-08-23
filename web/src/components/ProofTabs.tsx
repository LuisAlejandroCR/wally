'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * The three blocks of evidence, one at a time.
 *
 * Tabs rather than one long scroll: each block is a wide table, and stacking
 * three of them made the page read as more work than it is. Only the selected
 * panel is in the DOM.
 *
 * Two things it keeps from the scrolling version:
 *   - `/proof#injection` still opens the injection block, so the redirects from
 *     the old `/run`, `/injection` and `/policies` routes land where they used
 *     to, and a tab can still be linked to;
 *   - the strip stays reachable while a long table scrolls past, which is why
 *     it measures the site header into `--header-h` — the header wraps on a
 *     narrow screen and a fixed offset would overlap it or leave a gap.
 *
 * The trade-off, stated plainly: text in an unselected panel is not on the page,
 * so browser find does not reach it. The tab labels carry what is where.
 */

export type ProofPanel = { id: string; label: string; panel: ReactNode; hasVerbatim?: boolean }

export function ProofTabs ({ panels }: { panels: ProofPanel[] }) {
  const ids = panels.map((p) => p.id).join(',')
  const [active, setActive] = useState(panels[0].id)
  const [spanish, setSpanish] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  // The site header wraps on a narrow screen, so its height is measured rather
  // than assumed. `--header-h` is what the sticky offset and scroll margin use.
  useEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const publish = () => {
      document.documentElement.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  // A hash in the address bar picks the tab — on arrival, and on every change
  // after it, which is what makes the back button work between tabs.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1)
      if (id && ids.split(',').includes(id)) setActive(id)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [ids])

  const select = (id: string) => {
    setActive(id)
    // replaceState, not a hash assignment: the address bar stays shareable and
    // the browser does not jump the page out from under the click.
    window.history.replaceState(null, '', `#${id}`)
    stripRef.current?.scrollIntoView({ block: 'start' })
  }

  const current = panels.find((p) => p.id === active) ?? panels[0]

  // Left and right move between tabs, which is what a tablist is expected to do.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const order = ids.split(',')
    const at = order.indexOf(active)
    let next = -1
    if (e.key === 'ArrowRight') next = (at + 1) % order.length
    if (e.key === 'ArrowLeft') next = (at - 1 + order.length) % order.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = order.length - 1
    if (next < 0) return
    e.preventDefault()
    select(order[next])
    document.getElementById(`tab-${order[next]}`)?.focus()
  }

  return (
    <div data-verbatim={spanish ? 'on' : 'off'} className="space-y-8">
      <div
        ref={stripRef}
        className="proof-strip sticky z-10 -mx-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background/85 px-5 py-2.5 backdrop-blur"
        style={{ top: 'var(--header-h, 60px)' }}
      >
        <div
          role="tablist"
          aria-label="Which evidence to show"
          onKeyDown={onKeyDown}
          className="nav-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm"
        >
          {panels.map((p) => (
            <button
              key={p.id}
              id={`tab-${p.id}`}
              type="button"
              role="tab"
              aria-selected={p.id === active}
              aria-controls={`panel-${p.id}`}
              tabIndex={p.id === active ? 0 : -1}
              onClick={() => select(p.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 font-semibold transition-colors ${
                p.id === active ? 'bg-navy text-panel' : 'text-muted hover:bg-panel-high hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* The engine writes its reasons in Spanish and the page renders them in
            English. The original is one click away rather than doubling the
            length of every table by default — and the control only appears on a
            panel that has something to reveal. */}
        {current.hasVerbatim && (
          <button
            type="button"
            onClick={() => setSpanish((s) => !s)}
            aria-pressed={spanish}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              spanish ? 'border-gold bg-gold-bg text-gold-ink' : 'border-border text-muted hover:text-foreground'
            }`}
          >
            Engine&apos;s Spanish {spanish ? 'on' : 'off'}
          </button>
        )}
      </div>

      <div id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} tabIndex={-1}>
        {current.panel}
      </div>
    </div>
  )
}
