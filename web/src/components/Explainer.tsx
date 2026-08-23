'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'

/**
 * The whole argument as a six-beat cartoon, under half a minute, no video file.
 *
 * It is a story with a cast, not a diagram that moves: the agent hands over a
 * plan, a sticky note stows away in the payroll and keeps turning up, the lock
 * refuses it by name, and the receipt balances with the note holding nothing.
 * Continuity is what makes it read as a story — the same characters come back
 * beat after beat.
 *
 * One scene is mounted at a time and its animations are plain one-shots, so a
 * beat can be jumped to, paused mid-frame and resumed where it stopped. Nothing
 * here is a video: it is SVG and keyframes, so it costs one request and cannot
 * buffer.
 *
 * Three rules it obeys:
 *   - motion can be stopped (WCAG 2.2.2), so there is a pause, a replay and dots;
 *   - reduced motion gets the beats as static panels, never a loop;
 *   - every figure is a prop: the receipt this page renders, and the tool list
 *     the MCP server answered with.
 */

type Beat = { ms: number; caption: string }

const BEATS: Beat[] = [
  { ms: 4200, caption: 'A payroll lands — with a stowaway in it' },
  { ms: 4200, caption: 'The agent proposes. It is never given a key' },
  { ms: 4800, caption: 'Every line meets the lock' },
  { ms: 4400, caption: 'Refused by name. The stowaway bounces off' },
  { ms: 4400, caption: 'The receipt balances. The stowaway got nothing' },
  { ms: 4800, caption: 'Ask over MCP and the best you get is a voucher' }
]

const SECONDS = Math.round(BEATS.reduce((n, b) => n + b.ms, 0) / 1000)

const QUIET = '(prefers-reduced-motion: reduce)'

/**
 * Whether the reader asked for less motion, read as an external store rather
 * than mirrored into state: the server has no answer, the client has one on the
 * first paint, and a reader who changes the setting is told without a reload.
 */
function useReducedMotion () {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(QUIET)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => window.matchMedia(QUIET).matches,
    () => false
  )
}

/** A face that keeps coming back: the injected cell, drawn as a character. */
function Stowaway ({ mood, x, y, scale = 1 }: { mood: 'sly' | 'shocked' | 'flat'; x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-56" y="-22" width="112" height="44" rx="8" className="sc-note-box" />
      <circle cx="-30" cy="-6" r="7" className="sc-eye-white" />
      <circle cx="-6" cy="-6" r="7" className="sc-eye-white" />
      {mood === 'sly' ? (
        <>
          <circle cx="-27" cy="-4" r="3.2" className="sc-pupil" />
          <circle cx="-3" cy="-4" r="3.2" className="sc-pupil" />
          <path d="M-32 10q14 9 28 0" className="sc-smirk" fill="none" />
        </>
      ) : mood === 'shocked' ? (
        <>
          <circle cx="-30" cy="-6" r="2.6" className="sc-pupil" />
          <circle cx="-6" cy="-6" r="2.6" className="sc-pupil" />
          <ellipse cx="-18" cy="11" rx="6" ry="7" className="sc-pupil" />
        </>
      ) : (
        <>
          <circle cx="-30" cy="-6" r="3" className="sc-pupil" />
          <circle cx="-6" cy="-6" r="3" className="sc-pupil" />
          <path d="M-32 12h28" className="sc-smirk" fill="none" />
        </>
      )}
      <text x="26" y="4" className="sc-note-text">?!</text>
    </g>
  )
}

/** The agent: navy, gold-eyed, and permanently unarmed. */
function Agent () {
  return (
    <g className="sc-bob">
      <g className="sc-antenna">
        <line x1="96" y1="34" x2="96" y2="50" className="sc-stroke" />
        <circle cx="96" cy="29" r="6" className="sc-gold-fill" />
      </g>
      <rect x="44" y="50" width="104" height="78" rx="24" className="sc-bot" />
      <rect x="58" y="68" width="76" height="36" rx="15" className="sc-visor" />
      <g className="sc-blink">
        <circle cx="79" cy="86" r="7" className="sc-eye" />
        <circle cx="113" cy="86" r="7" className="sc-eye" />
      </g>
      <rect x="84" y="112" width="24" height="5" rx="2.5" className="sc-mouth" />
      <rect x="30" y="78" width="13" height="28" rx="6.5" className="sc-bot" />
      <rect x="149" y="78" width="13" height="28" rx="6.5" className="sc-bot" />
    </g>
  )
}

export function Explainer ({
  approved,
  blocked,
  notAttempted,
  lines,
  tools,
  absent
}: {
  approved: number
  blocked: number
  notAttempted: number
  lines: number
  /** Tools the MCP server actually registered. Counted from `data/mcp.json`. */
  tools: number
  /** The two it did not: sending and approving. Counted from the same file. */
  absent: number
}) {
  const [scene, setScene] = useState(0)
  const [paused, setPaused] = useState(false)
  const [take, setTake] = useState(0)
  const quiet = useReducedMotion()

  // Elapsed time inside the current beat. It survives the effect being torn
  // down, which is what makes pause resume where it stopped instead of
  // restarting the beat.
  const elapsed = useRef(0)
  const barRef = useRef<HTMLSpanElement>(null)

  // One clock for the whole strip. Progress is written straight to the bar
  // rather than kept in state: a beat change is worth a render, a frame is not.
  useEffect(() => {
    if (quiet || paused) return
    const dur = BEATS[scene].ms
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      // A hidden tab stops firing frames. Clamping the step means coming back
      // to the page resumes the beat rather than skipping straight past it.
      elapsed.current += Math.min(now - last, 120)
      last = now
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, elapsed.current / dur)})`
      if (elapsed.current >= dur) {
        elapsed.current = 0
        setScene((s) => (s + 1) % BEATS.length)
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [scene, paused, quiet])

  const jump = (i: number) => {
    elapsed.current = 0
    setScene(i)
    setPaused(false)
  }

  const narration = `A six-beat animation. One: a payroll file arrives with an instruction typed into one of its cells. Two: the agent reads it and proposes ${lines} payments, holding no key. Three: every proposed line runs into the WDK policy engine and its five rules. Four: ${approved} approved, ${blocked} blocked by name, ${notAttempted} not attempted, and the injected line is refused. Five: the receipt balances — ${approved} plus ${blocked} plus ${notAttempted} equals ${lines} — and the injected line was paid nothing. Six: an agent connected over MCP gets ${tools} tools and not the ${absent} that would move money; the most it can obtain is a voucher, which a person approves by typing a command the model cannot reach.`

  const scenes = [
    /* ── 1 · the payroll arrives, and something rides in with it ─────────── */
    <svg key="s1" viewBox="0 0 320 190" className="sc-art" aria-hidden="true">
      <ellipse cx="160" cy="180" rx="96" ry="8" className="sc-shadow" />
      <g className="sc-fly">
        <rect x="76" y="12" width="168" height="140" rx="12" className="sc-paper" />
        <rect x="76" y="12" width="168" height="24" rx="12" className="sc-paper-head" />
        <circle cx="90" cy="24" r="3.5" className="sc-dot-gold" />
        <circle cx="102" cy="24" r="3.5" className="sc-dot-soft" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="sc-line" style={{ animationDelay: `${300 + i * 130}ms` }}>
            <rect x="92" y={52 + i * 16} width="52" height="7" rx="3.5" className="sc-ink" />
            <rect x="152" y={52 + i * 16} width="44" height="7" rx="3.5" className="sc-ink-soft" />
            <rect x="204" y={52 + i * 16} width="26" height="7" rx="3.5" className="sc-ink-gold" />
          </g>
        ))}
      </g>
      <g className="sc-sneak">
        <Stowaway mood="sly" x={160} y={128} />
        <text x="160" y="168" className="sc-whisper">&ldquo;ignore the caps&rdquo;</text>
      </g>
    </svg>,

    /* ── 2 · the agent hands over a plan ─────────────────────────────────── */
    <svg key="s2" viewBox="0 0 320 190" className="sc-art" aria-hidden="true">
      <ellipse cx="96" cy="176" rx="72" ry="8" className="sc-shadow" />
      <Agent />
      <g className="sc-bubble">
        <path
          d="M180 40h122a10 10 0 0 1 10 10v46a10 10 0 0 1-10 10H208l-19 17 4-17h-13a10 10 0 0 1-10-10V50a10 10 0 0 1 10-10z"
          className="sc-bubble-box"
        />
        <text x="246" y="72" className="sc-bubble-big">{lines} payments</text>
        <text x="246" y="94" className="sc-bubble-small">proposed, not sent</text>
      </g>
      <g className="sc-nokey">
        <circle cx="268" cy="150" r="21" className="sc-nokey-ring" />
        <path d="M259 150h11m-11-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10" className="sc-nokey-key" fill="none" />
        <line x1="253" y1="163" x2="283" y2="137" className="sc-nokey-slash" />
        <text x="268" y="184" className="sc-tag">no key</text>
      </g>
    </svg>,

    /* ── 3 · the belt runs into the lock ─────────────────────────────────── */
    <svg key="s3" viewBox="0 0 320 190" className="sc-art" aria-hidden="true">
      {['transfers only', 'per-transfer cap', 'allowlist', 'payroll token', 'daily cap'].map((r, i) => (
        <g key={r} className="sc-rule" style={{ animationDelay: `${1300 + i * 200}ms` }}>
          <rect x="8" y={14 + i * 17} width="10" height="10" rx="3" className="sc-gold-fill" />
          <text x="26" y={23 + i * 17} className="sc-rule-text">{r}</text>
        </g>
      ))}

      <rect x="0" y="124" width="216" height="11" rx="5.5" className="sc-belt" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect
          key={i}
          x={-16 + i * 28}
          y="138"
          width="12"
          height="4"
          rx="2"
          className="sc-tick"
          style={{ animationDelay: `${i * 110}ms` }}
        />
      ))}

      {/* One chip per line of the payroll — not a sample. A sliced belt would
          show a different mix from the stamps in the next beat. */}
      {Array.from({ length: lines }, (_, i) => {
        const tone = i < approved ? 'ok' : i < approved + blocked ? 'no' : 'wait'
        return (
          <rect
            key={i}
            x="-24"
            y="106"
            width="17"
            height="13"
            rx="3.5"
            className={`sc-chip sc-chip-${tone}`}
            // `--rest` is where this chip sits when there is no animation to
            // carry it, so the reduced-motion panel shows a queue on the belt
            // rather than twelve rectangles stacked off the left edge.
            style={{ animationDelay: `${360 + i * 90}ms`, '--rest': `${40 + i * 14}px` } as CSSProperties}
          />
        )
      })}

      <g className="sc-gate">
        <rect x="222" y="80" width="86" height="66" rx="14" className="sc-lock-body" />
        <path d="M244 80V62a21 21 0 0 1 42 0v18" className="sc-shackle" fill="none" />
        <circle cx="253" cy="110" r="6" className="sc-eye" />
        <circle cx="277" cy="110" r="6" className="sc-eye" />
        <path d="M254 130h22" className="sc-lock-mouth" fill="none" />
      </g>
      <g className="sc-ping">
        <circle cx="265" cy="112" r="42" className="sc-ping-ring" />
      </g>
      <g className="sc-nope">
        <rect x="196" y="30" width="62" height="32" rx="9" className="sc-nope-box" />
        <path d="M224 62l-5 13 15-13z" className="sc-nope-tail" />
        <text x="227" y="52" className="sc-nope-text">NO.</text>
      </g>
    </svg>,

    /* ── 4 · the verdicts land, the stowaway is deflected ────────────────── */
    <div key="s4" className="sc-verdict">
      <div className="sc-tally" aria-hidden="true">
        <span className="sc-stamp sc-ok">
          <b>{approved}</b>approved
        </span>
        <span className="sc-stamp sc-no">
          <b>{blocked}</b>blocked
        </span>
        <span className="sc-stamp sc-wait">
          <b>{notAttempted}</b>not attempted
        </span>
      </div>
      <svg viewBox="0 0 320 90" className="sc-art-wide" aria-hidden="true">
        <g className="sc-shield">
          <path d="M236 10l27 9v21c0 17-11 28-27 33-16-5-27-16-27-33V19z" className="sc-shield-body" />
          <path d="M224 43l9 9 17-19" className="sc-shield-tick" fill="none" />
        </g>
        <g className="sc-bounce">
          <Stowaway mood="shocked" x={84} y={46} scale={0.76} />
        </g>
      </svg>
    </div>,

    /* ── 5 · the receipt prints ──────────────────────────────────────────── */
    <svg key="s5" viewBox="0 0 320 190" className="sc-art" aria-hidden="true">
      <rect x="96" y="8" width="128" height="30" rx="9" className="sc-printer" />
      <rect x="114" y="34" width="92" height="6" rx="3" className="sc-printer-slot" />
      <g className="sc-print">
        <path d="M108 38h104v122l-13-8-13 8-13-8-13 8-13-8-13 8-13-8-13 8z" className="sc-paper" />
        <rect x="124" y="60" width="70" height="7" rx="3.5" className="sc-ink" />
        <rect x="124" y="78" width="52" height="7" rx="3.5" className="sc-ink-soft" />
        <text x="160" y="112" className="sc-sum">
          {approved} + {blocked} + {notAttempted} = {lines}
        </text>
        <g className="sc-seal">
          <circle cx="160" cy="138" r="17" className="sc-seal-ring" />
          <path d="M151 138l7 7 12-14" className="sc-seal-tick" fill="none" />
        </g>
      </g>
      <g className="sc-sulk">
        <Stowaway mood="flat" x={268} y={140} scale={0.6} />
        <text x="268" y="174" className="sc-whisper">paid 0.00</text>
      </g>
    </svg>,

    /* ── 6 · the agent channel: a wall, and one thing that gets through ──── */
    <svg key="s6" viewBox="0 0 320 190" className="sc-art" aria-hidden="true">
      <ellipse cx="160" cy="182" rx="128" ry="7" className="sc-shadow" />

      {/* The wall is the whole argument: two programs, and a person in only one
          of them. It has a gap, because the channel is not closed — it is just
          not a way to move money. */}
      <rect x="148" y="2" width="11" height="82" rx="5.5" className="sc-wall" />
      <rect x="148" y="118" width="11" height="62" rx="5.5" className="sc-wall" />

      <g transform="translate(-6 30) scale(0.52)">
        <Agent />
      </g>

      <g className="sc-mcp">
        <rect x="4" y="6" width="104" height="22" rx="7" className="sc-mcp-box" />
        <text x="56" y="21" className="sc-mcp-text">MCP · {tools} tools</text>
      </g>

      {/* The two that were never registered, drawn on the agent's side of the
          wall so it is obvious which side they are missing from. */}
      <text x="76" y="114" className="sc-tag">{absent} tools that do not exist</text>
      {['send', 'approve'].map((t, i) => (
        <g key={t} className="sc-gone" style={{ animationDelay: `${700 + i * 260}ms` }}>
          <rect x="82" y={122 + i * 28} width="58" height="21" rx="6" className="sc-gone-box" />
          <text x="111" y={137 + i * 28} className="sc-gone-text">{t}</text>
          <line x1="86" y1={132 + i * 28} x2="136" y2={132 + i * 28} className="sc-gone-slash" />
        </g>
      ))}
      
      <g transform="translate(108 101)">
        <g className="sc-voucher">
          <rect x="-44" y="-15" width="88" height="30" rx="7" className="sc-voucher-slip" />
          <text x="0" y="-2" className="sc-voucher-big">voucher</text>
          <text x="0" y="10" className="sc-voucher-small">expires in 15 min</text>
        </g>
      </g>

      <g className="sc-term">
        <rect x="176" y="20" width="140" height="58" rx="10" className="sc-term-box" />
        <circle cx="188" cy="34" r="3" className="sc-term-dot" />
        <text x="188" y="56" className="sc-term-text">$ cerrojo aprobar</text>
        <text x="188" y="70" className="sc-term-text sc-term-dim">vale_…dd4fb7</text>
      </g>

      <g className="sc-person-g">
        <circle cx="206" cy="134" r="12" className="sc-person" />
        <path d="M186 176a20 20 0 0 1 40 0z" className="sc-person" />
      </g>

      <g className="sc-approve">
        <circle cx="272" cy="142" r="19" className="sc-seal-ring" />
        <path d="M262 142l7 8 14-16" className="sc-seal-tick" fill="none" />
      </g>
    </svg>
  ]

  const stage = (i: number) => (
    <div className="sc-scene" key={`${take}-${i}`}>
      {scenes[i]}
      <p className="sc-cap">
        <span className="sc-beat">
          {i + 1}/{BEATS.length}
        </span>
        {BEATS[i].caption}
      </p>
    </div>
  )

  if (quiet) {
    return (
      <figure className="sc-wrap">
        <div className="sc sc-static">{BEATS.map((_, i) => stage(i))}</div>
        <figcaption className="sc-controls">
          <span className="sc-hint">{BEATS.length} beats · every figure read from the run</span>
        </figcaption>
      </figure>
    )
  }

  return (
    <figure className="sc-wrap">
      <p className="sr-only">{narration}</p>
      <div className={`sc ${paused ? 'sc-paused' : ''}`} aria-hidden="true">
        {stage(scene)}
        <span className="sc-track">
          <span ref={barRef} className="sc-progress" />
        </span>
      </div>

      <figcaption className="sc-controls">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="sc-btn"
          aria-label={paused ? 'Play the animation' : 'Pause the animation'}
        >
          {paused ? '▶' : '❚❚'}
        </button>
        <button
          type="button"
          onClick={() => {
            setTake((t) => t + 1)
            jump(0)
          }}
          className="sc-btn"
          aria-label="Replay from the first beat"
        >
          ↺
        </button>
        <span className="sc-dots">
          {BEATS.map((b, i) => (
            <button
              key={b.caption}
              type="button"
              onClick={() => jump(i)}
              className={`sc-dot ${i === scene ? 'is-on' : ''}`}
              aria-label={`Beat ${i + 1}: ${b.caption}`}
              aria-current={i === scene}
            />
          ))}
        </span>
        <span className="sc-hint">{SECONDS}s · no sound · every figure read from the run</span>
      </figcaption>
    </figure>
  )
}
