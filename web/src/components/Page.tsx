import Link from 'next/link'
import type { ReactNode } from 'react'
import { Reveal } from '@/components/Reveal'
import { Help } from '@/components/Help'
import type { Term } from '@/lib/glossary'

/**
 * The page kit. Every screen is built from these five pieces, so a new page
 * inherits the layout instead of re-deciding it — and a change to the rhythm
 * happens here once rather than in five files that drifted apart.
 *
 * The shape every screen follows:
 *
 *   <Page>
 *     <PageHeader eyebrow title lead actions />   ← never revealed on scroll:
 *     <Section title lead aside>…</Section>          it is already in view
 *     <Section tone="panel">…</Section>
 *     <NextSteps>…</NextSteps>                    ← no page dead-ends
 *   </Page>
 */

const CTA = {
  primary:
    'rounded-full bg-gold px-5 py-2.5 font-semibold text-navy shadow-[0_14px_30px_-12px_rgba(233,162,59,0.75)] transition-colors hover:bg-gold-2',
  ghost: 'rounded-full border border-border bg-panel px-5 py-2.5 font-semibold transition-colors hover:bg-panel-high'
} as const

/** One vertical rhythm for every screen. */
export function Page ({ children }: { children: ReactNode }) {
  return <div className="space-y-14">{children}</div>
}

/** The gold-dashed pill that says which screen this is. */
export function Eyebrow ({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-panel/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-navy">
      <span aria-hidden="true" className="h-0.5 w-5 rounded bg-gold" />
      {children}
    </p>
  )
}

/**
 * The top of every screen: eyebrow, one heading, one lead sentence, and the
 * buttons that belong to the whole page. `size="hero"` is the landing page —
 * the same parts, set larger.
 */
export function PageHeader ({
  eyebrow,
  title,
  lead,
  actions,
  size = 'page'
}: {
  eyebrow: ReactNode
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
  size?: 'page' | 'hero'
}) {
  const hero = size === 'hero'
  return (
    <header className="space-y-5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1
        className={
          hero
            ? 'max-w-4xl text-4xl font-bold leading-[1.06] sm:text-6xl'
            : 'max-w-3xl text-3xl font-bold leading-tight sm:text-4xl'
        }
      >
        {title}
      </h1>
      {lead && (
        <p className={`max-w-2xl leading-relaxed text-muted ${hero ? 'text-lg sm:text-xl' : 'text-lg'}`}>{lead}</p>
      )}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  )
}

/**
 * A band of the page. It reveals on scroll, carries at most one heading and one
 * lead, and takes an `aside` for the small right-aligned status line that three
 * screens wanted and each had written differently.
 */
export function Section ({
  id,
  eyebrow,
  title,
  lead,
  aside,
  tone = 'plain',
  children,
  className = ''
}: {
  id?: string
  eyebrow?: ReactNode
  title?: ReactNode
  lead?: ReactNode
  aside?: ReactNode
  tone?: 'plain' | 'panel'
  children: ReactNode
  className?: string
}) {
  const shell =
    tone === 'panel'
      ? 'rounded-2xl border border-border bg-panel p-6 shadow-[0_18px_44px_-22px_rgba(18,41,79,0.28)] sm:p-8'
      : ''

  return (
    <Reveal id={id} className={`space-y-5 ${shell} ${className}`.trim()}>
      {(eyebrow || title || lead || aside) && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="space-y-1.5">
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue">{eyebrow}</p>
            )}
            {title && <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>}
            {lead && <p className="max-w-2xl text-muted">{lead}</p>}
          </div>
          {aside && <p className="text-sm text-muted">{aside}</p>}
        </div>
      )}
      {children}
    </Reveal>
  )
}

/** The one card in the system. Nothing else invents its own border and lift. */
export function Card ({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rise rounded-xl border border-border bg-panel p-5 ${className}`.trim()}>{children}</div>
}

/** The small print under a table or a figure. */
export function Note ({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-sm leading-relaxed text-muted">{children}</p>
}

/**
 * One number, said once.
 *
 * Four screens were each drawing this by hand and had drifted — different type
 * sizes, three different label treatments, two different grids. It is the same
 * object everywhere it appears: a figure, what it counts, and optionally the raw
 * value underneath for anyone who wants to check the rounding.
 *
 * `size="lg"` is the landing page, where a stat is the loudest thing on screen.
 */
export function Stat ({
  value,
  label,
  tone = 'text-foreground',
  hint,
  title,
  help,
  size = 'md',
  delay = 0
}: {
  value: ReactNode
  label: string
  tone?: string
  hint?: ReactNode
  title?: string
  /** A glossary term, when the label alone does not say what is being counted. */
  help?: Term
  size?: 'md' | 'lg'
  delay?: number
}) {
  return (
    <div
      className="count-in rise rounded-xl border border-border bg-panel p-4 sm:p-5"
      style={{ animationDelay: `${delay}ms` }}
      title={title}
    >
      <div className={`font-bold tabular-nums ${size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-3xl'} ${tone}`}>
        {value}
      </div>
      <div className="mt-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
        {help && <Help of={help} />}
      </div>
      {hint && <div className="mt-2 font-mono text-xs text-muted">{hint}</div>}
    </div>
  )
}

/** A row of them: two across on a phone, three or four on a desk. */
export function StatRow ({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>{children}</div>
  )
}

/** A page button. Two tones, and no component writes the classes itself. */
export function Cta ({
  href,
  tone = 'ghost',
  external = false,
  children
}: {
  href: string
  tone?: keyof typeof CTA
  external?: boolean
  children: ReactNode
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={CTA[tone]}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={CTA[tone]}>
      {children}
    </Link>
  )
}

/** The foot of every screen: where to go next, so no page is a dead end. */
export function NextSteps ({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Where to go next" className="flex flex-wrap gap-3 border-t border-border pt-8">
      {children}
    </nav>
  )
}
