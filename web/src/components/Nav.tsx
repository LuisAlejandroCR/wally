'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The site nav, with the current page marked.
 *
 * It is a client component only because it needs the pathname: knowing where
 * you are is the cheapest orientation a three-page site can offer. On a narrow
 * screen the row scrolls sideways rather than wrapping onto a second line,
 * which kept the header from growing taller than the content it sits above.
 */
const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/proof', label: 'The proof' },
  { href: '/operator', label: 'Operator' }
]

export function Nav () {
  const path = usePathname()

  return (
    <nav className="nav-scroll -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm">
      {NAV.map((item) => {
        const here = item.href === '/' ? path === '/' : path.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={here ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
              here ? 'bg-panel-high font-semibold text-navy' : 'text-muted hover:bg-panel-high hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
