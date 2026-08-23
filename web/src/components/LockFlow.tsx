/**
 * The one animation this product owns: a payment proposal meeting the lock.
 *
 * It is used in three places — the hero, the how-it-works strip and the
 * security section — and it always says the same thing, so a reader who sees it
 * once recognises it everywhere. Motion is decorative only: every stage is
 * legible with animation off, and `prefers-reduced-motion` is honoured globally
 * in `globals.css`, so nothing here needs to detect it.
 */

type Verdict = 'approved' | 'blocked'

const TONE: Record<Verdict, { border: string; bg: string; text: string; dot: string }> = {
  approved: { border: 'border-green/40', bg: 'bg-green-bg', text: 'text-green', dot: 'bg-green' },
  blocked: { border: 'border-red/40', bg: 'bg-red-bg', text: 'text-red', dot: 'bg-red' }
}

function LockGlyph ({ open, className = '' }: { open: boolean; className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      {open ? <path d="M8 10.5V7a4 4 0 0 1 7.5-1.9" /> : <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />}
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Arrow () {
  return (
    <div className="flex items-center justify-center py-1 sm:py-0" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-border-strong sm:-rotate-90">
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
    </div>
  )
}

function Stage ({
  step,
  actor,
  action,
  detail,
  className = '',
  delay = 0
}: {
  step: string
  actor: string
  action: string
  detail: string
  className?: string
  delay?: number
}) {
  return (
    <div
      className={`flow-stage rounded-xl border p-4 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{step}</span>
        <span className="font-mono text-xs text-muted">{actor}</span>
      </div>
      <p className="mt-1.5 text-base font-bold leading-snug">{action}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  )
}

/**
 * The full three-layer flow. `verdict` decides what the lock does with the
 * proposal, and therefore whether WDK is reached at all.
 */
export function LockFlow ({ verdict = 'approved', compact = false }: { verdict?: Verdict; compact?: boolean }) {
  const tone = TONE[verdict]
  const approved = verdict === 'approved'

  return (
    <div className={`grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch ${compact ? '' : 'sm:gap-3'}`}>
      <Stage
        step="01 · propose"
        actor="AI"
        action="Reads the payroll, writes a plan"
        detail="No key, no limits, no way to send."
        className="border-border bg-panel"
        delay={0}
      />
      <Arrow />
      <div
        className={`flow-stage rounded-xl border p-4 ${tone.border} ${tone.bg}`}
        style={{ animationDelay: '160ms' }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">02 · decide</span>
          <span className="font-mono text-xs text-muted">Cerrojo</span>
        </div>
        <p className={`mt-1.5 flex items-center gap-2 text-base font-bold leading-snug ${tone.text}`}>
          <span className={approved ? 'flow-unlock' : 'flow-shake'}>
            <LockGlyph open={approved} />
          </span>
          {approved ? 'Within every rule' : 'Refused by rule'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {approved
            ? 'Cap, allowlist, token and daily total all check out.'
            : 'The rules live in code the model cannot reach.'}
        </p>
      </div>
      <Arrow />
      {approved ? (
        <Stage
          step="03 · execute"
          actor="WDK"
          action="Signs and sends"
          detail="Only lines the lock authorised ever get here."
          className="border-green/40 bg-green-bg"
          delay={320}
        />
      ) : (
        <div className="flow-stage rounded-xl border border-dashed border-border bg-panel p-4 opacity-70" style={{ animationDelay: '320ms' }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">03 · execute</span>
            <span className="font-mono text-xs text-muted">WDK</span>
          </div>
          <p className="mt-1.5 text-base font-bold leading-snug text-muted">Never called</p>
          <p className="mt-1 text-sm text-muted">No transaction exists to undo.</p>
        </div>
      )}
    </div>
  )
}

/** The vertical, label-only version for a tight column. */
export function LockFlowMini () {
  return (
    <ol className="space-y-2" aria-label="AI proposes, Cerrojo decides, WDK executes">
      {[
        { actor: 'AI', verb: 'proposes', tone: 'text-muted' },
        { actor: 'Cerrojo', verb: 'authorises', tone: 'text-blue' },
        { actor: 'WDK', verb: 'executes', tone: 'text-green' }
      ].map((s, i) => (
        <li key={s.actor} className="flow-stage flex items-center gap-3" style={{ animationDelay: `${i * 140}ms` }}>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${i === 0 ? 'bg-border-strong' : i === 1 ? 'bg-blue' : 'bg-green'}`} aria-hidden />
          <span className="font-mono text-sm font-semibold">{s.actor}</span>
          <span className={`text-sm ${s.tone}`}>{s.verb}</span>
        </li>
      ))}
    </ol>
  )
}
