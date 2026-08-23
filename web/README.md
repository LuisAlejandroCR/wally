# Cerrojo web — the deployable front end

The demo site for people who will never clone a repository. Three screens: the argument, the
evidence, and — behind a sign-in — an operator screen that can run a payroll against a live engine.

**This app decides nothing.** Every `estado`, `policy.id`, `rule` and `reason` on screen is a field
of a receipt that WDK's policy engine produced. There is not one policy condition written here, and
no route that sends funds — the Cerrojo API has no such endpoint, and `--live` exists only in the
CLI behind two explicit flags.

## Two modes, one interface

| | Recorded (default) | Live |
|---|---|---|
| What it renders | Real receipts produced by `node src/cli.js run --json`, shipped in `src/data/` | The same interface, answers fetched from a running Cerrojo API |
| Needs | nothing | `CERROJO_API_URL` pointing at a reachable engine |
| Who can run a payroll | nobody — it is a recording | a signed-in operator, dry-run only |

`CERROJO_API_URL` is a server-side variable on purpose: the browser never learns where the engine
lives, so the tunnel address is not in the page source. The engine's seed never leaves the machine
that runs the engine — it is never sent here, and this deployment could not use it if it were.

## Run it locally

```bash
cd web
npm install
cp .env.example .env.local   # fill in the two Clerk keys
npm run dev                  # http://localhost:3000
```

Clerk keys come from `clerk init --app <app-id>` or `clerk env pull`, which write them into
`.env.local`. The app reads `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`; the older
`CLERK_API_KEY` name is not used by `@clerk/nextjs` v7.

To point it at a live engine, in a second terminal:

```bash
cd code && node src/cli.js serve
```

and set `CERROJO_API_URL=http://127.0.0.1:8787` in `.env.local`. From Vercel the same variable has
to be a URL the deployment can reach — a tunnel to your machine, not `127.0.0.1`.

## Deploy to Vercel

```bash
npx vercel deploy
```

Set in the Vercel project settings, not in the repository:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | public by design |
| `CLERK_SECRET_KEY` | yes | server only, never in client code |
| `CERROJO_API_URL` | no | leave unset for the recorded demo, which is what the judges see |

## What is gated, and why

Reading is public: a verdict nobody can check is worth nothing. Running a payroll is not public,
because it consumes the day's accumulator and writes a receipt. Signing in widens nothing else —
the caps, the allowlist and the token pin are enforced by the policy engine either way, and an
account cannot talk them down.

## Refreshing the recorded receipts

```bash
cd code
CERROJO_STATE_DIR=/tmp/st1 node src/cli.js run --csv evals/fixtures/nomina_agosto.csv    --json > ../web/src/data/run-clean.json
CERROJO_STATE_DIR=/tmp/st2 node src/cli.js run --csv evals/fixtures/nomina_inyeccion.csv --json > ../web/src/data/run-poisoned.json
curl -s http://127.0.0.1:8787/politicas > ../web/src/data/policies.json
```

Each run needs its own `CERROJO_STATE_DIR`, or the second one starts with the daily cap already
spent and the comparison stops meaning anything. The two files shipped here were produced this way
and both report 7 executed / 2 denied / 3 not attempted.

## Layout

Three screens: **see it**, **check it**, **run it**.

```text
src/
├── app/
│   ├── page.tsx            overview: the cartoon, the headline numbers, the argument
│   ├── proof/              the evidence, in three anchored blocks —
│   │                         #receipt    totals, receipt table, four checks, provenance
│   │                         #injection  clean vs poisoned, line by line
│   │                         #policies   the five policies, live when an engine URL is set
│   ├── operator/           sign-in gated: run a payroll against the live engine
│   └── api/live/[action]/  the only bridge to an engine. Five read-or-simulate calls, no send
├── components/
│   ├── Page.tsx            the page kit every screen is built from — see below
│   ├── Explainer.tsx       the five-beat cartoon on the overview
│   ├── ProofNav.tsx        the sticky block switcher on /proof
│   └── Receipt.tsx         receipt table, status pills, amounts, checks
├── data/                   real receipts and the recorded /politicas response
└── lib/cerrojo.ts          the receipt contract, transcribed from real output
```

`/run`, `/injection` and `/policies` were separate screens once; they redirect to their block of
`/proof` from `next.config.ts`.

## The page kit

Every screen is assembled from `components/Page.tsx`, so a new page inherits the layout instead of
re-deciding it:

```tsx
<Page>                                       one vertical rhythm
  <PageHeader eyebrow title lead actions />  size="hero" on the overview
  <Section id eyebrow title lead aside />    reveals on scroll; tone="panel" for a raised block
  <Card> <Note> <Cta tone="primary|ghost">
  <NextSteps>                                every screen offers somewhere to go
</Page>
```

The two button styles, the card border, the heading sizes and the section spacing are defined there
once. A screen that writes its own is drifting.
