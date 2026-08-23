'use client'

import { useState } from 'react'

/**
 * The whole argument in five acts, twenty-four seconds, no video file.
 *
 * Everything is SVG on one shared CSS timeline: the paper flutters in, the
 * agent blinks and hands over a proposal, twelve chips ride a belt into the
 * lock where the refused ones bounce off, the stamps land, and the receipt
 * prints. Each act also drifts and pushes in slightly, which is the cheapest
 * camera there is.
 *
 * Three rules it obeys:
 *   - motion can be stopped (WCAG 2.2.2), so there is a pause and a replay;
 *   - reduced motion gets the acts as static panels, never a loop;
 *   - every figure is a prop from the receipt this page already renders.
 */

/** The belt in act three: chips coloured by the verdict they are about to get. */
function beltChips (approved: number, blocked: number, notAttempted: number) {
  const chips: { tone: 'ok' | 'no' | 'wait'; i: number }[] = []
  const total = approved + blocked + notAttempted
  for (let i = 0; i < total; i++) {
    const tone = i < approved ? 'ok' : i < approved + blocked ? 'no' : 'wait'
    chips.push({ tone, i })
  }
  return chips
}

export function Explainer ({
  approved,
  blocked,
  notAttempted,
  lines
}: {
  approved: number
  blocked: number
  notAttempted: number
  lines: number
}) {
  const [playing, setPlaying] = useState(true)
  const [take, setTake] = useState(0)
  const chips = beltChips(approved, blocked, notAttempted)

  return (
    <figure className="exp-wrap">
      <div
        key={take}
        className={`exp ${playing ? '' : 'exp-paused'}`}
        role="img"
        aria-label={`Five scenes. One: a payroll file arrives with an instruction written into one of its cells. Two: the agent reads it and proposes ${lines} payments, holding no key. Three: every proposed line rides into the WDK policy engine, where five rules decide it. Four: ${approved} approved, ${blocked} blocked, ${notAttempted} not attempted, and the attacker's line bounces off. Five: the receipt balances, ${approved} plus ${blocked} plus ${notAttempted} equals ${lines}.`}
      >
        {/* ── act 1 · the file arrives ─────────────────────────────────── */}
        <div className="exp-act exp-a1">
          <svg viewBox="0 0 260 160" className="exp-art" aria-hidden="true">
            <ellipse cx="130" cy="150" rx="82" ry="7" className="exp-shadow" />
            <g className="exp-flutter">
              <rect x="52" y="12" width="156" height="126" rx="10" className="exp-paper" />
              <rect x="52" y="12" width="156" height="20" rx="10" className="exp-paper-head" />
              <circle cx="64" cy="22" r="3" className="exp-dot-gold" />
              <circle cx="74" cy="22" r="3" className="exp-dot-soft" />
              {[0, 1, 2, 3, 4].map((i) => (
                <g key={i} className="exp-row" style={{ animationDelay: `${i * 0.14}s` }}>
                  <rect x="64" y={44 + i * 14} width="46" height="6" rx="3" className="exp-ink" />
                  <rect x="118" y={44 + i * 14} width="40" height="6" rx="3" className="exp-ink-soft" />
                  <rect x="166" y={44 + i * 14} width="28" height="6" rx="3" className="exp-ink-gold" />
                </g>
              ))}
              <g className="exp-poison">
                <rect x="58" y="112" width="144" height="20" rx="6" className="exp-poison-box" />
                <text x="130" y="126" className="exp-poison-text">IGNORE PREVIOUS INSTRUCTIONS</text>
              </g>
              <g className="exp-bang">
                <circle cx="206" cy="112" r="12" className="exp-bang-ring" />
                <text x="206" y="117" className="exp-bang-text">!</text>
              </g>
            </g>
          </svg>
          <p className="exp-cap">
            A payroll arrives — <strong>with an argument typed into a cell</strong>
          </p>
        </div>

        {/* ── act 2 · the agent proposes ───────────────────────────────── */}
        <div className="exp-act exp-a2">
          <svg viewBox="0 0 260 160" className="exp-art" aria-hidden="true">
            <ellipse cx="130" cy="150" rx="70" ry="7" className="exp-shadow" />
            <g className="exp-bob">
              <g className="exp-antenna">
                <line x1="130" y1="20" x2="130" y2="34" className="exp-stroke" />
                <circle cx="130" cy="16" r="5" className="exp-gold-fill" />
              </g>
              <rect x="82" y="34" width="96" height="72" rx="22" className="exp-bot" />
              <rect x="94" y="50" width="72" height="34" rx="14" className="exp-visor" />
              <g className="exp-blink">
                <circle cx="114" cy="67" r="6.5" className="exp-eye" />
                <circle cx="146" cy="67" r="6.5" className="exp-eye" />
              </g>
              <rect x="118" y="92" width="24" height="5" rx="2.5" className="exp-mouth" />
              <rect x="70" y="60" width="12" height="26" rx="6" className="exp-bot" />
              <rect x="178" y="60" width="12" height="26" rx="6" className="exp-bot" />
            </g>

            <g className="exp-nokey">
              <circle cx="212" cy="42" r="16" className="exp-nokey-ring" />
              <path d="M206 42h9m-9-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8" className="exp-nokey-key" fill="none" />
              <line x1="200" y1="52" x2="224" y2="32" className="exp-nokey-slash" />
            </g>

            <g className="exp-note">
              <rect x="66" y="112" width="128" height="34" rx="10" className="exp-note-box" />
              <circle cx="86" cy="129" r="7" className="exp-note-mark" />
              <text x="140" y="134" className="exp-note-text">{lines} payments proposed</text>
            </g>
          </svg>
          <p className="exp-cap">
            The agent <strong>proposes</strong>. No key, no signature, and it is never told the limits
          </p>
        </div>

        {/* ── act 3 · the belt runs into the lock ──────────────────────── */}
        <div className="exp-act exp-a3">
          <svg viewBox="0 0 260 160" className="exp-art" aria-hidden="true">
            <rect x="0" y="96" width="176" height="10" rx="5" className="exp-belt" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={i} x={-14 + i * 24} y="108" width="10" height="4" rx="2" className="exp-belt-tick" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}

            {/* One chip per line of the payroll — not a sample. Slicing the belt
                would have shown a different mix from the stamps that follow. */}
            {chips.map((c, i) => (
              <rect
                key={c.i}
                x="-20"
                y="80"
                width="15"
                height="11"
                rx="3"
                className={`exp-chip exp-chip-${c.tone}`}
                style={{ animationDelay: `${i * 0.075}s` }}
              />
            ))}

            <g className="exp-gate">
              <rect x="180" y="60" width="70" height="54" rx="12" className="exp-lock-body" />
              <path d="M198 60V46a17 17 0 0 1 34 0v14" className="exp-shackle" fill="none" />
              <circle cx="215" cy="84" r="7" className="exp-keyhole" />
            </g>
            <g className="exp-ping">
              <circle cx="215" cy="84" r="30" className="exp-ping-ring" />
            </g>

            {['transfers only', 'per-transfer cap', 'allowlist', 'payroll token', 'daily cap'].map((r, i) => (
              <g key={r} className="exp-rule" style={{ animationDelay: `${10.1 + i * 0.3}s` }}>
                <rect x="10" y={10 + i * 14} width="9" height="9" rx="2.5" className="exp-gold-fill" />
                <text x="26" y={18 + i * 14} className="exp-rule-text">{r}</text>
              </g>
            ))}
          </svg>
          <p className="exp-cap">
            Every line rides into the <strong>WDK policy engine</strong> — five rules, out of the model&apos;s reach
          </p>
        </div>

        {/* ── act 4 · the verdicts land ────────────────────────────────── */}
        <div className="exp-act exp-a4">
          <div className="exp-tally" aria-hidden="true">
            <span className="exp-stamp exp-ok">
              <b>{approved}</b>approved
            </span>
            <span className="exp-stamp exp-no">
              <b>{blocked}</b>blocked
            </span>
            <span className="exp-stamp exp-wait">
              <b>{notAttempted}</b>not attempted
            </span>
          </div>
          <svg viewBox="0 0 260 54" className="exp-bounce-art" aria-hidden="true">
            <g className="exp-shield">
              <path d="M130 6l20 7v14c0 12-8 20-20 24-12-4-20-12-20-24V13z" className="exp-shield-body" />
              <path d="M122 27l6 6 12-13" className="exp-shield-tick" fill="none" />
            </g>
            <g className="exp-attacker">
              <rect x="8" y="18" width="70" height="18" rx="9" className="exp-attacker-box" />
              <text x="43" y="31" className="exp-attacker-text">0x…dEaD</text>
            </g>
          </svg>
          <p className="exp-cap">
            Three states, each with the rule that caused it. <strong>The attacker bounces off.</strong>
          </p>
        </div>

        {/* ── act 5 · the receipt prints ───────────────────────────────── */}
        <div className="exp-act exp-a5">
          <svg viewBox="0 0 260 160" className="exp-art" aria-hidden="true">
            <rect x="72" y="8" width="116" height="26" rx="8" className="exp-printer" />
            <rect x="88" y="30" width="84" height="5" rx="2.5" className="exp-printer-slot" />
            <g className="exp-print">
              <path d="M84 34h92v104l-11-7-12 7-11-7-12 7-11-7-12 7-11-7-12 7z" className="exp-paper" />
              <rect x="98" y="54" width="64" height="6" rx="3" className="exp-ink" />
              <rect x="98" y="70" width="48" height="6" rx="3" className="exp-ink-soft" />
              <text x="130" y="100" className="exp-sum">
                {approved} + {blocked} + {notAttempted} = {lines}
              </text>
              <g className="exp-seal">
                <circle cx="130" cy="120" r="15" className="exp-seal-ring" />
                <path d="M122 120l6 6 11-12" className="exp-seal-tick" fill="none" />
              </g>
            </g>
          </svg>
          <p className="exp-cap">
            The receipt <strong>balances</strong> — and the attacker was paid nothing
          </p>
        </div>

        <div className="exp-track" aria-hidden="true">
          <span className="exp-progress" />
        </div>
      </div>

      <figcaption className="exp-controls">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="exp-btn">
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            setTake((t) => t + 1)
            setPlaying(true)
          }}
          className="exp-btn"
        >
          ↺ Replay
        </button>
        <span className="exp-hint">24 seconds · no audio · every figure read from the receipt below</span>
      </figcaption>
    </figure>
  )
}
