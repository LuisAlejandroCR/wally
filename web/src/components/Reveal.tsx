'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Reveals a block once it enters the viewport, and only once.
 *
 * The hidden state is a class this effect adds after mount, never markup the
 * server sends, so a page with no JavaScript renders every word. Anyone who
 * asked for reduced motion is opted out before the observer exists, and the
 * class is added to the node directly rather than through state — an animation
 * is a DOM concern, not something React needs to re-render for.
 */
export function Reveal ({
  children,
  delay = 0,
  className = ''
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const quiet = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (quiet || typeof IntersectionObserver !== 'function') return

    node.classList.add('reveal')
    if (delay) node.style.transitionDelay = `${delay}ms`

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.classList.add('in')
            io.disconnect()
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    )

    io.observe(node)
    return () => io.disconnect()
  }, [delay])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
