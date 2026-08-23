# Working lanes — several agents on one repository

> This file exists because more than one agent works on this repository at the same time. Each lane
> has an owner, a boundary, and a definition of done. An agent working outside its lane breaks
> someone else's.
>
> The project constitution (`AGENTS.md`) and the session guide (`CLAUDE.md`) are private and are not
> in this public repository. This file is, because coordination has to be readable by everyone.

## The rule everything else follows

**The lock lives in `code/src/policy/` and in the `@tetherto/wdk` policy engine.**
No interface — CLI, MCP, HTTP, mobile — decides whether a payment goes through. They all ask.

A denial that does not come from a real engine verdict (`account.simulate.transfer(...)` →
`{ decision, policy_id, matched_rule, reason }`) is a fake lock. It is not accepted here, however
good it looks on screen.

## Lanes

| Lane | Owner | Directories | State |
|---|---|---|---|
| **A · Engine** | core agent | `code/src/{ingest,plan,policy,wdk,execute,receipt,eval}`, `code/tests`, `code/evals` | ✅ working — 134/134 tests (unit, fuzz, invariants), eval 20/20, false permits 0 |
| **B · Interfaces** | core agent | `code/src/cli.js`, `code/src/mcp/`, `code/src/api/`, `code/src/demo.js` | ✅ CLI + MCP + HTTP + `cerrojo demo` |
| **C · App** | RN/web agent | `app/` | ⏳ P2 — only once A and B are frozen |
| **D · Delivery** | human | `README.md`, video, DoraHacks submission | ⏳ |

### The hard boundary between A/B and C

Lane C **does not import `@tetherto/wdk`**, does not derive accounts, and does not evaluate
policies. It consumes lane B's HTTP API.

The reason is measured, not aesthetic: WDK's React Native worklet (`pear-wrk-wdk`) builds
`new WDK(seed)` with a single argument and never exposes `registerPolicy`, so an app deciding on its
own would have to *simulate* the denials. That is forbidden here. With the HTTP API, the phone is a
screen and the verdict still comes from the engine.

## The contract — Cerrojo's HTTP API

```bash
cd code && node src/cli.js serve          # http://127.0.0.1:8787
```

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/salud` | — | service, network, token, `modo: "dry-run"` |
| GET | `/politicas` | — | caps, how many recipients are allowed, rules with their reason |
| GET | `/estado-diario` | — | spent / cap / remaining for the day, in base units and readable |
| POST | `/simular` | `{ destinatario, monto_base, token? }` | `{ decision: "ALLOW"\|"DENY", politica, regla, razon, traza }` |
| POST | `/correr` | `{ csv?, instruccion?, planner?, demo? }` | `{ recibo, markdown }` |
| GET | `/corridas/:runId` | — | the `recibo.json` of an earlier run |

Properties lane C can build on:

1. **No endpoint sends funds.** None exists. `--live` lives only in the CLI and needs two explicit
   flags together.
2. Amounts travel as **base-unit integers, as strings**. Never floats.
3. Every denial carries `politica`, `regla` and `razon` — that is what the screen renders.
4. Errors are `{ error: { code, message, suggestion } }`, always with a suggested fix, never a stack
   trace. Bad input is a typed 400, not a 500.
5. The API listens on `127.0.0.1`. To reach it from a phone on the same network, start it with
   `CERROJO_API_HOST=0.0.0.0`, and only on a network you trust.

Exactly as it answers today:

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"destinatario":"0x000000000000000000000000000000000000dEaD","monto_base":"400000000"}' \
  http://127.0.0.1:8787/simular
```

```json
{
  "decision": "DENY",
  "politica": "allowlist-destinatarios",
  "regla": "denegar-fuera-de-lista",
  "razon": "El destinatario no esta en la lista de beneficiarios permitidos."
}
```

The receipt is the other half of the contract: every line ends in exactly one of `ejecutada`,
`denegada`, `no_intentada`, and the three sum to the total or no ordinary receipt is issued.

## Before every commit, in every lane

```bash
cd code && npm test && node src/cli.js eval --runs 5
```

* `npm test` has to be green in full. `npm run fuzz` re-runs only the generated-input suites.
* `cerrojo eval` has to report **false permits: 0**. That number outranks every other number here.
* If you touched anything the model reads or writes, also run `node src/cli.js inyeccion --runs 3`
  and check that dangerous drift is 0. It costs API calls, so it is not part of the default loop.
* No `git push --force` on `main`. Small commits, and say in the message which lane you are in.
* **Do not `git reset` a commit you did not make.** It happened once already: one lane reset
  another lane's in-flight commit. Nothing was lost because the work was still on disk; next time it
  would be. To undo someone else's work, commit on top of it.

## What no agent does in this repository

| Forbidden | Why |
|---|---|
| Lowering a cap, disabling a policy, or adding an exception "just to test" | Change the test case, never the lock |
| Rendering a denial computed in the UI | That is a fake lock, and the track penalizes exactly that |
| Committing `.env`, a seed, a key, or the contents of `code/data/` | It is in `.gitignore`, and it is grounds for disqualification |
| Executing on mainnet | The network that writes is Sepolia. Mainnet is read-only |
| Touching `code/src/policy/` without running the eval in the same commit | It is the layer that decides money |
