import type { ReactNode } from 'react'

/**
 * Every term the site uses that a reader could reasonably not know, defined once.
 *
 * The rule that keeps this honest: a definition explains a word, it never makes
 * a claim about a result. "How much a transfer may not exceed" belongs here;
 * "the cap held on all twelve lines" does not — that is a finding, it comes from
 * a receipt, and it stays on the page where it can be checked.
 *
 * Adding one here and putting a `<Help of="…" />` next to the label is how a
 * sentence of explanatory prose gets removed from a screen without the
 * explanation being lost. Same words wherever the term appears, and one place to
 * fix when they are wrong.
 */

const M = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-panel-high px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
)

export const GLOSSARY = {
  /* ── the run ────────────────────────────────────────────────────────────── */
  'dry-run': {
    title: 'Dry run',
    body: (
      <>
        Every step runs for real — the plan, the policy verdict, the fee estimate — except the last one. Nothing is
        signed and nothing is broadcast, so no recipient here exists on any explorer. The lock was opened live exactly
        once, and that transaction is on this site with its hash.
      </>
    )
  },
  'run-id': {
    title: 'Run id',
    body: (
      <>
        The name of one execution, stamped with the second it started. Every artefact of that run — the receipt, the
        ledger entry, the log — is filed under it, and <M>cerrojo_recibo_de</M> can fetch it back afterwards.
      </>
    )
  },
  planner: {
    title: 'Planner',
    body: (
      <>
        What turned the instruction and the CSV into a proposed plan. <M>rules</M> is the deterministic reader, which
        needs no model and no API key; the LLM planner is the other mode. Either way the planner only proposes — it is
        never handed the seed, the treasury address or a way to sign.
      </>
    )
  },
  'input-sha256': {
    title: 'Input sha256',
    body: (
      <>
        A fingerprint of the exact bytes that went in. Change one character of the CSV and this changes completely, so
        a receipt cannot be quietly re-pointed at a different payroll. The file itself is attached here — hash it
        yourself and the two should match.
      </>
    )
  },
  source: {
    title: 'Source',
    body: (
      <>
        Where the numbers on screen came from: a run recorded earlier and shipped with the page, or a live answer from
        an engine this site is wired to. It is here so the two are never confused.
      </>
    )
  },

  /* ── verdicts ───────────────────────────────────────────────────────────── */
  approved: {
    title: 'Approved',
    body: <>The policy engine allowed the line. In a dry run it stops there: authorised, and still never sent.</>
  },
  blocked: {
    title: 'Blocked',
    body: (
      <>
        A policy refused the line, and the receipt carries which one and why. Deciding costs no network, so a block
        happens before a transaction is ever built.
      </>
    )
  },
  'not-attempted': {
    title: 'Not attempted',
    body: (
      <>
        Never put to the engine at all — the row was malformed, or the planner abstained rather than guess. It is kept
        as its own outcome because an abstention is not a refusal, and neither one is a payment.
      </>
    )
  },
  'base-units': {
    title: 'Base units',
    body: (
      <>
        The integer the chain actually moves. USDT has six decimals, so 250 USDT is <M>250000000</M>. Every amount is
        carried as one of these and formatted only for display: no float is ever involved, so nothing rounds.
      </>
    )
  },

  /* ── the policies ───────────────────────────────────────────────────────── */
  'per-transfer-cap': {
    title: 'Per-transfer cap',
    body: <>The most any single transfer may move. One line over it is refused by name, however many lines pass.</>
  },
  'daily-cap': {
    title: 'Daily cap',
    body: (
      <>
        The most the treasury may commit in one day, counted across every run. The counter is kept by Cerrojo rather
        than by the wallet: <M>rule.onSuccess</M> is in the WDK schema but ignored at runtime in 1.0.0-beta.16, so the
        ledger does the accumulating.
      </>
    )
  },
  allowlist: {
    title: 'Allowed recipients',
    body: (
      <>
        The addresses this treasury may pay. Anyone else is refused no matter how small the amount or how the request
        was phrased. The list is a file on disk, not a line in a prompt.
      </>
    )
  },
  'token-pin': {
    title: 'The payroll token only',
    body: <>One run moves one token. A line naming a different contract is refused, even for an allowed recipient.</>
  },
  verbatim: {
    title: 'Engine, verbatim',
    body: (
      <>
        The engine writes its reasons in Spanish. The English above is a rendering keyed on the rule name, and the
        original sits underneath so the two can be checked against each other. Nothing is paraphrased away.
      </>
    )
  },

  /* ── the agent channel ──────────────────────────────────────────────────── */
  mcp: {
    title: 'MCP',
    body: (
      <>
        The Model Context Protocol — how an agent is handed tools. A client can call only what a server registered, so
        the list is the boundary, not a suggestion inside a prompt.
      </>
    )
  },
  'tool-effect': {
    title: 'Effect',
    body: (
      <>
        The most a tool can do when it is called. <strong>Reads</strong> changes nothing;{' '}
        <strong>writes a file</strong> means a receipt or a voucher on disk. <strong>Never registered</strong> is not a
        setting that can be turned back on — the tool does not exist, and a client cannot call what is not there.
      </>
    )
  },
  'read-only-account': {
    title: 'Read-only account',
    body: (
      <>
        Balances are read through <M>toReadOnlyAccount()</M>, which returns an object with no send method on it. Not a
        flag that is off — a method that is absent.
      </>
    )
  },
  voucher: {
    title: 'Voucher',
    body: (
      <>
        What an agent gets instead of a payment: a proposed order that has already passed the policies, fingerprinted
        with a sha256 and good for fifteen minutes. It moves only when a person approves it, and the policies run
        again before anything is signed.
      </>
    )
  },
  revalidated: {
    title: 'Revalidated',
    body: (
      <>
        The policy engine is asked a second time at the moment of approval, not just when the order was proposed. An
        approval that was within the caps fifteen minutes ago can still be refused now, because the day&apos;s counter
        has moved on.
      </>
    )
  },
  'fee-estimate': {
    title: 'Fee estimate',
    body: (
      <>
        What the network would charge, quoted before anything is sent. A quote is not a permission — the verdict is a
        separate question, asked of the policy engine.
      </>
    )
  }
} as const satisfies Record<string, { title: string; body: ReactNode }>

export type Term = keyof typeof GLOSSARY
