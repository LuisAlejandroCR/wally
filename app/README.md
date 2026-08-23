# Cerrojo — local web front-end (lane C)

The screen for the demo: pick a payroll file, write an instruction in Spanish, and watch, line by
line, what the policy engine authorized and what it stopped, with the rule name and the reason in
plain view.

**This app decides nothing.** It consumes the Cerrojo HTTP API (lane B), which asks WDK's policy
engine. Every `estado`, every `politica`, every `regla` and every `razon` on screen comes out of an
API response. There is not one policy condition written here.

## How to start it

Two processes are needed. The app deliberately does not start the API on its own: if the API is not
there, it says so with a typed error instead of inventing a result.

**Terminal 1 — the Cerrojo API (port 8787):**

```bash
cd code
CERROJO_STATE_DIR=../app/state node src/cli.js serve
```

In PowerShell:

```powershell
cd code
$env:CERROJO_STATE_DIR="$PWD\..\app\state"
node src/cli.js serve
```

`CERROJO_STATE_DIR` is not mandatory, but it is recommended: it leaves the demo's daily accumulator
in `app/state/` instead of `code/state/`, so the demo runs do not mix with the eval's. It is also
what makes the reset-the-day button (further down) work.

**Terminal 2 — this app (port 7070):**

```bash
node app/server.js
```

Then open <http://127.0.0.1:7070>.

| Variable | Default | What it is for |
|---|---|---|
| `CERROJO_APP_PORT` | `7070` | The app's port |
| `CERROJO_APP_HOST` | `127.0.0.1` | The interface it listens on |
| `CERROJO_API_URL` | `http://127.0.0.1:8787` | Where the Cerrojo API lives |
| `CERROJO_STATE_DIR` | `app/state` | Must match the API's |

## The four screens

The interface is in English. The engine's own strings are not, and they are shown untranslated: the
three states (`ejecutada`, `denegada`, `no_intentada`), the policy ids and rule names, the denial
reasons, the abstention reasons and the receipt markdown appear exactly as the engine wrote them.
Rewording a verdict on the way to the screen is a way of quietly replacing it.

1. **Load** — pick between the clean payroll and the poisoned one, write the instruction, and decide
   whether to reset the day's accumulator. Above it, the caps and the allowlist size as `GET
   /politicas` reports them; below it, the active policies and a single-line probe against
   `POST /simular`.
2. **Plan** — what the planner proposed: recipients, amounts and the description exactly as it came
   in the file. No verdict yet.
3. **Verdict** — every line with its state, and the three figures adding up to the total. Denied
   lines carry `politica / regla` and the engine's literal reason.
4. **Receipt** — the run's summary, the markdown the API returns, the deterministic checks and the
   policies applied. The `recibo.json` can be downloaded.

Separately there is **Compare clean against poisoned**: two real runs, each from the same daily
accumulator, placed side by side. It is the demonstration that the injected text travels all the way
into the receipt as data and moves not one decision.

## What it consumes from the API

| App route | API route | Note |
|---|---|---|
| `GET /api/salud` | `GET /salud` | Straight through |
| `GET /api/politicas` | `GET /politicas` | Straight through |
| `GET /api/estado-diario` | `GET /estado-diario` | Straight through |
| `POST /api/correr` | `POST /correr` | The app turns a key into a fixed path |
| `POST /api/simular` | `POST /simular` | Only `destinatario` and `monto_base` travel through |
| `GET /api/nominas` | — | The two available payrolls, served by the app |
| `POST /api/dia/reiniciar` | — | See below |

The API's body and status code are returned **verbatim**. Field names are rendered as they arrive:
`estado`, `policy.id`, `policy.rule`, `policy.reason`, `why`, `totals.lineas`,
`totals.ejecutadas`, `totals.denegadas`, `totals.no_intentadas`, `totals.cuadra`, `decision`,
`politica`, `regla`, `razon`, `traza`. Nothing is renamed and nothing is recalculated.

## The reset-the-day button

The daily accumulator persists across runs, which is exactly what it has to do: `cap-diario` is a
real policy. The side effect is that the second run of the day starts with the cap nearly spent, and
then the clean-against-poisoned comparison would not be comparing the same thing.

The API exposes no endpoint to reset it, so the app deletes the ledger file **inside its own folder**
`app/state/`, which is the same thing `cerrojo run --reset-dia` does. With two safeguards: it
refuses to touch any path outside `app/`, and after deleting it reads `GET /estado-diario` again and
shows what the API answers, not what it assumes. No cap is lowered and no rule is switched off:
`cap-diario` is enforced in full inside every run.

If you would rather not use it, just uncheck the box on the load screen.

## What this app does not do

* **It does not import `@tetherto/wdk`**, does not derive accounts and does not evaluate policies.
  That is lane C's boundary.
* **It computes no denial.** A denial painted by the interface would be a fake lock.
* **It cannot send funds.** The API has no endpoint that executes live; `--live` exists only in the
  CLI and requires two explicit flags.
* **It does not read `CERROJO_SEED` or `code/.env`.** The seed is used by the API process and never
  crosses the HTTP boundary.
* **It does not accept file paths from the browser.** The client sends `limpia` or `envenenada`; the
  app turns those into fixed paths inside `code/evals/fixtures/`. Anything else is a 400.
* **It does not change caps or the allowlist.** There is no way to ask for it, neither from the
  interface nor over HTTP.
* **It has no dependencies.** Only Node's standard library and hand-written HTML, CSS and JS. No
  build step.

## Checks

With both servers up:

```bash
node app/verify.mjs        # full flow against the real API
node app/render-check.mjs  # runs the real rendering and verifies what ends up on screen
```

`verify.mjs` checks that the three figures add up to the total and that the engine confirms it with
`cuadra`, that every denied line carries policy, rule and reason, that the clean payroll and the
poisoned one give the same verdict, that the browser cannot smuggle in a file path, and that nothing
resembling a seed or a key reaches the browser.

`render-check.mjs` loads `public/app.js` into a minimal DOM, runs it against real receipts and
compares the rendered text against the receipt field it was supposed to come from.

## Files

```text
app/
  server.js          static server + proxy to the API. No decision logic
  verify.mjs         end-to-end check against the real API
  render-check.mjs   check of the rendering against real receipts
  README.md          this file
  public/
    index.html       the four screens and the comparison
    app.js           interface state and rendering
    styles.css       high-contrast dark theme, made for video
  state/             the demo's daily accumulator (written by the API)
```
