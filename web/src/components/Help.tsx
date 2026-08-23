'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY, type Term } from '@/lib/glossary'

/**
 * The small round `?` that carries a definition.
 *
 * Every screen here had the same problem: a figure or a column heading that
 * means something precise, explained in a sentence of prose underneath, which
 * then has to be read by everyone including the people who already knew. The
 * definition is not wrong — it is just in the wrong place. Here it sits behind a
 * `?` next to the thing it defines, so the page is short for a reader who is
 * scanning and complete for a reader who stops.
 *
 * Two mechanics matter:
 *
 *   - **it is a portal.** Half the places that need one are inside a table with
 *     `overflow-x: auto` or a card that lifts on hover, and both of those clip
 *     or re-anchor an absolutely positioned panel. Rendering into `document.body`
 *     at fixed coordinates is the only version that works everywhere;
 *   - **it is a button, not a hover.** A tooltip that only appears on hover does
 *     not exist on a touchscreen and cannot be reached from a keyboard.
 *
 * Definitions live in `lib/glossary` so a term is written once and reads the
 * same everywhere it appears. `<Help of="dry-run" />` is the normal call; the
 * `title` + children form is for the handful that belong to one screen only.
 */

type Props =
  | { of: Term; title?: never; children?: never; className?: string }
  | { of?: never; title: string; children: ReactNode; className?: string }

/** Where the panel goes: under the button, nudged back inside the viewport. */
function place (button: DOMRect) {
  const width = Math.min(300, window.innerWidth - 16)
  const left = Math.min(Math.max(8, button.left + button.width / 2 - width / 2), window.innerWidth - width - 8)

  // Below the button unless that would run off the bottom, in which case above
  // it. The panel's own height is unknown here, so the flip is decided by where
  // the button sits rather than by measuring it.
  const below = Math.max(8, button.bottom + 8)
  const roomBelow = window.innerHeight - button.bottom

  return roomBelow > 200
    ? { top: below, left, width, maxHeight: window.innerHeight - below - 12 }
    : { top: Math.max(8, button.top - 8 - 200), left, width, maxHeight: Math.max(120, button.top - 20) }
}

export function Help (props: Props) {
  const { className = '' } = props
  const entry = props.of ? GLOSSARY[props.of] : { title: props.title, body: props.children }

  const [box, setBox] = useState<ReturnType<typeof place> | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const open = box !== null

  const close = useCallback(() => setBox(null), [])

  const toggle = () => {
    if (open) return close()
    if (button.current) setBox(place(button.current.getBoundingClientRect()))
  }

  // The panel is pinned to a coordinate, so it has to be told when the page
  // moves under it. Dismissing on scroll was the first attempt and it was wrong:
  // clicking a `?` near the edge of the viewport makes the browser scroll the
  // button into view, which closed the panel in the same frame it opened — a
  // button that visibly does nothing. So it follows its button instead, and only
  // a keypress or a click elsewhere dismisses it.
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        button.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  // Following the button on scroll and resize events was still not enough: the
  // sections on these pages reveal as they come into view, so the button can
  // move without any event firing at all and the panel is left pointing at where
  // it used to be. Measuring once a frame is what actually holds, and it only
  // re-renders when the number changed — so an open panel that is not moving
  // costs one `getBoundingClientRect` per frame and nothing else.
  useEffect(() => {
    if (!open) return

    let frame = 0
    let last = ''

    const tick = () => {
      const el = button.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const key = `${rect.top}|${rect.left}|${window.innerWidth}|${window.innerHeight}`
        if (key !== last) {
          last = key
          setBox(place(rect))
        }
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`What is ${entry.title}?`}
        className={`ml-1 inline-grid h-[1.15em] w-[1.15em] shrink-0 translate-y-[0.06em] place-items-center rounded-full border align-middle text-[0.72em] font-bold leading-none transition-colors ${
          open
            ? 'border-navy bg-navy text-panel'
            : 'border-border-strong/60 text-muted hover:border-navy hover:text-navy'
        } ${className}`}
      >
        <span aria-hidden="true">?</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={entry.title}
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
            className="help-pop fixed z-50 overflow-y-auto rounded-xl border border-border-strong/60 bg-panel p-3.5 shadow-[0_24px_60px_-24px_rgba(18,41,79,0.5)]"
          >
            <p className="text-sm font-bold text-navy">{entry.title}</p>
            <div className="mt-1 text-sm leading-relaxed text-muted">{entry.body}</div>
          </div>,
          document.body
        )}
    </>
  )
}
