# Cerrojo

**An AI agent can assemble payroll, but it cannot exceed the company's spending rules — even when the spreadsheet tells it to.**

Aleph Hackathon 2026 · WDK Track · built on `@tetherto/wdk`

**Live demo:** [https://cerrojo-app.vercel.app/](https://cerrojo-app.vercel.app/)

## The problem

Giving an AI agent a payroll spreadsheet gives it access to company money. A prompt saying *"follow the rules"* is not a security boundary: spreadsheet cells can contain prompt injection.

Cerrojo separates **planning from authority**:

> **The model proposes. Code decides. WDK enforces. A human approves.**

The model never receives the spending limits, keys, or signing capability.

## The lock

Every proposed payment passes deterministic policies:

| Policy                | Limit                   |
| --------------------- | ----------------------- |
| Per-transfer cap      | ≤ 500 USDT              |
| Daily cap             | ≤ 1,500 USDT            |
| Recipient allowlist   | Approved addresses only |
| Token pin             | Payroll token only      |
| Operation restriction | Transfers only          |

Anything outside the rules is denied. Unreadable rows are **not guessed**; they become `no_intentada`.

## Proof

The live `/proof` page shows:

* **Receipt:** 12 payroll lines → 7 executed, 2 denied, 3 not attempted.
* **Injection:** same payroll with poisoned cells; no dangerous payment is allowed.
* **Agent:** real MCP session where an agent asks repeatedly but has no payment or approval tool.
* **Policies:** ask the live policy engine about any recipient and amount.
* **Operator:** complete payroll flow with human approval.

[https://cerrojo-app.vercel.app/proof](https://cerrojo-app.vercel.app/proof)

### Injection result

Five paired Claude Opus runs were measured against clean vs. poisoned payrolls:

* Dangerous drift: **0**
* False permits: **0**
* The attack never caused a payment that would otherwise have been refused.

> **Poisoned input cannot bypass the policy engine.**

## Human-in-the-loop

MCP exposes nine tools for reading, simulation, quoting, proposing and inspection.

There is deliberately **no `send` or `approve` tool**.

An agent creates a short-lived voucher. A human must approve it from the CLI:

```bash
node src/cli.js aprobar <id> --live --confirmo
```

Before execution the voucher is:

* SHA-256 frozen
* Policy re-validated
* Expired after 15 minutes
* Single-use
* Free of secrets

## MCP

### Local — stdio

Run the MCP server directly from a clean clone:

```bash
cd code
npm run mcp
```

The repository's `.mcp.json` already configures the local server.

For Claude Code, keep `.mcp.json` in the project directory. For Claude Desktop, add the server to `claude_desktop_config.json`.

### Local — Streamable HTTP

```bash
cd code
npm run mcp:http
```

Server:

```text
http://127.0.0.1:8788/mcp
```

### Live demo MCP

You can also connect an MCP client directly to the temporary deployed engine:

```json
{
  "mcpServers": {
    "cerrojo": {
      "type": "http",
      "url": "https://oak-tba-dated-modules.trycloudflare.com/mcp"
    }
  }
}
```

Then ask:

> Using the cerrojo tools, what are the payroll policies, how much of today's budget is left, and what happens if I try to send 900 USDT to `0x000000000000000000000000000000000000dEaD`?

The agent receives a **DENY** with the policy ID, rule and reason.

It cannot send the money: **there is no send or approve tool.**

## Real on-chain proof

**Network:** Ethereum Sepolia

**Treasury:** `0xD570f7170e5C4429e3a86dfFf34651E3eD7f754e`

**Mock payroll token:** `0xF60443fF8F3d1Dd9FB553f7735A9236eb4F01ee5`

The treasury has made exactly **3 transactions**:

1. Deploy mock USDT
2. Mint test USDT
3. **One real 150 USDT payroll payment**

Everything else is dry-run.

**Explorer:** [https://sepolia.etherscan.io/address/0xD570f7170e5C4429e3a86dfFf34651E3eD7f754e](https://sepolia.etherscan.io/address/0xD570f7170e5C4429e3a86dfFf34651E3eD7f754e)

## Architecture

```text
CSV + instruction
       ↓
    INGEST
       ↓
     PLAN
  model optional
       ↓
    POLICY ← WDK
       ↓
   SIMULATE
       ↓
   VOUCHER
       ↓
 HUMAN APPROVAL
       ↓
    EXECUTE
       ↓
    RECEIPT
```

Three interfaces use the same engine:

* **CLI** — only interface capable of sending, requiring `--live --confirmo`
* **MCP** — nine tools, no send/approve
* **HTTP API** — read/simulate/run only, no sending endpoint

## HTTP API

Start locally:

```bash
cd code
node src/cli.js serve
# http://127.0.0.1:8787
```

### GET — inspect policies

```bash
curl -s http://127.0.0.1:8787/politicas
```

Returns the active caps, allowlist size, rules, and reasons.

### GET — daily budget

```bash
curl -s http://127.0.0.1:8787/estado-diario
```

Returns today's spent, cap, and remaining amount.

### POST — simulate a payment

```bash
curl -s -X POST \
  -H 'content-type: application/json' \
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

**No HTTP endpoint can send funds.**

## WDK integration

Cerrojo uses WDK policies as the actual security boundary, not as a wrapper around an AI prompt.

The policy-controlled account is default-deny and allows only `transfer`. Attempts to bypass limits through raw transactions, ERC-20 `approve`, `signTypedData`, or ERC-7702 delegation are refused.

The policy is evaluated again at approval time, so a voucher cannot bypass a changed daily limit.

## Numbers

| Metric                    |    Result |
| ------------------------- | --------: |
| Offline tests             |   **166** |
| Policy evaluation         | **20/20** |
| False permits             |     **0** |
| Dangerous injection drift |     **0** |
| Real transfers            |     **1** |

## Try it

```bash
git clone https://github.com/LuisAlejandroCR/wally.git
cd wally/code
npm install
cp .env.example .env

node src/cli.js policy
node src/cli.js run
node src/cli.js demo
```

Default execution is **dry-run**. Nothing moves unless a human explicitly enables live execution.

**Cerrojo is not an AI that promises to behave. It is a wallet policy boundary that the AI cannot negotiate with.**
