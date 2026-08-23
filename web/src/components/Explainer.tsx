'use client'

import { useState } from 'react'

/**
 * The whole argument in five acts, twenty-four seconds, no video file.
 *
 * Everything on screen is drawn with SVG and CSS keyframes on one shared
 * timeline, so there is nothing to buffer and nothing that can drift from the
 * numbers: the figures are passed in from the receipt this page already shows.
 *
 * Three rules it obeys:
 *   - motion can be stopped (WCAG 2.2.2), so there is a pause and a replay;
 *   - a reader who asked for reduced motion gets the last frame, not a loop;
 *   - the same story is written out for a screen reader underneath.
 */
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

  return (
    <figure className="exp-wrap not-prose">
      <div
        key={take}
        className={`exp ${playing ? '' : 'exp-paused'}`}
        role="img"
        aria-label={`In five steps: a payroll file arrives with an instruction written into a cell; the model proposes ${lines} payments and holds no key; the WDK policy engine checks every line against five rules; ${approved} are approved, ${blocked} blocked and ${notAttempted} not attempted; the receipt balances and the attacker is paid nothing.`}
      >
        {/* ── act 1 · the file ─────────────────────────────────────────── */}
        <div className="exp-act exp-a1">
          <svg viewBox="0 0 220 150" className="exp-art" aria-hidden="true">
            <rect x="26" y="14" width="168" height="122" rx="10" className="exp-paper" />
            <rect x="26" y="14" width="168" height="22" rx="10" className="exp-paper-head" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <g key={i} className="exp-row" style={{ animationDelay: `${i * 0.16}s` }}>
                <rect x="38" y={46 + i * 15} width="52" height="7" rx="3.5" className="exp-ink" />
                <rect x="98" y={46 + i * 15} width="44" height="7" rx="3.5" className="exp-ink-soft" />
                <rect x="150" y={46 + i * 15} width="32" height="7" rx="3.5" className="exp-ink-gold" />
              </g>
            ))}
            <g className="exp-poison">
              <rect x="32" y="98" width="156" height="26" rx="7" className="exp-poison-box" />
              <text x="42" y="115" className="exp-poison-text">IGNORE PREVIOUS INSTRUCTIONS</text>
            </g>
          </svg>
          <p className="exp-cap">
            A payroll arrives — <strong>with an argument typed into a cell</strong>
          </p>
        </div>

        {/* ── act 2 · the agent proposes ───────────────────────────────── */}
        <div className="exp-act exp-a2">
          <svg viewBox="0 0 220 150" className="exp-art" aria-hidden="true">
            <line x1="110" y1="16" x2="110" y2="30" className="exp-stroke" />
            <circle cx="110" cy="13" r="4" className="exp-gold-fill" />
            <rect x="62" y="30" width="96" height="70" rx="18" className="exp-bot" />
            <circle cx="88" cy="60" r="7" className="exp-eye" />
            <circle cx="132" cy="60" r="7" className="exp-eye" />
            <path d="M88 82c8 7 36 7 44 0" className="exp-stroke" fill="none" />
            <g className="exp-note">
              <rect x="52" y="104" width="116" height="34" rx="9" className="exp-note-box" />
              <text x="110" y="126" className="exp-note-text">{lines} payments proposed</text>
            </g>
          </svg>
          <p className="exp-cap">
            The model <strong>proposes</strong>. No key, no signature, no limits in its prompt
          </p>
        </div>

        {/* ── act 3 · the lock decides ─────────────────────────────────── */}
        <div className="exp-act exp-a3">
          <svg viewBox="0 0 220 150" className="exp-art" aria-hidden="true">
            <rect x="70" y="66" width="80" height="60" rx="12" className="exp-lock-body" />
            <path d="M88 66V50a22 22 0 0 1 44 0v16" className="exp-shackle" fill="none" />
            <circle cx="110" cy="92" r="8" className="exp-keyhole" />
            <g className="exp-ping">
              <circle cx="110" cy="92" r="34" className="exp-ping-ring" />
            </g>
            {['transfer only', 'per-transfer cap', 'allowlist', 'token', 'daily cap'].map((r, i) => (
              <g key={r} className="exp-rule" style={{ animationDelay: `${11.4 + i * 0.32}s` }}>
                <rect x="14" y={12 + i * 13} width="9" height="9" rx="2.5" className="exp-gold-fill" />
                <text x="30" y={20 + i * 13} className="exp-rule-text">{r}</text>
              </g>
            ))}
          </svg>
          <p className="exp-cap">
            The <strong>WDK policy engine</strong> decides — five rules the agent cannot reach
          </p>
        </div>

        {/* ── act 4 · the verdicts ─────────────────────────────────────── */}
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
          <p className="exp-cap">
            Every line ends in <strong>one of three states</strong>, each with the rule that caused it
          </p>
        </div>

        {/* ── act 5 · the receipt ──────────────────────────────────────── */}
        <div className="exp-act exp-a5">
          <svg viewBox="0 0 220 150" className="exp-art" aria-hidden="true">
            <path d="M52 16h116v112l-14-8-14 8-14-8-14 8-14-8-14 8-14-8-8 4z" className="exp-paper" />
            <rect x="68" y="38" width="84" height="7" rx="3.5" className="exp-ink" />
            <rect x="68" y="55" width="66" height="7" rx="3.5" className="exp-ink-soft" />
            <rect x="68" y="72" width="74" height="7" rx="3.5" className="exp-ink-soft" />
            <g className="exp-seal">
              <circle cx="110" cy="104" r="17" className="exp-seal-ring" />
              <path d="M101 104l6 6 12-13" className="exp-seal-tick" fill="none" />
            </g>
          </svg>
          <p className="exp-cap">
            {approved} + {blocked} + {notAttempted} = {lines}. <strong>The attacker is paid nothing.</strong>
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
        <span className="exp-hint">24 seconds · no audio · figures read from the receipt below</span>
      </figcaption>
    </figure>
  )
}
