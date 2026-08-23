#!/usr/bin/env node
// src/mcp/http.js
//
// The same nine tools as `src/mcp/server.js`, reachable over the network.
//
// Why a second transport at all: stdio requires the client to spawn a local
// process, which means cloning the repository and holding the seed. Over
// Streamable HTTP anyone can point an MCP client at a URL and drive the real
// engine — which is the only honest way to let someone check that the agent
// channel is what we say it is, rather than a screenshot of one.
//
// Why that is safe to leave open, in the same order the tools are registered:
//   - no tool sends. There is no `transfer`, no `sign`, no `--live`.
//   - no tool approves. Approving exists only in the CLI, where a person types
//     it, and the policy engine gets asked again before anything is signed.
//   - no tool returns the seed, or anything derived from it.
//   - the caps, the allowlist and the token pin are WDK policies, so a caller
//     who is rude to the model gains nothing: the model is not the lock.
// The most an anonymous caller can achieve is a voucher sitting in a queue on
// someone else's machine, waiting for a human who will read it first.
//
//   node src/mcp/http.js [--puerto 8788] [--host 127.0.0.1]

import { createServer } from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { cargarConfig } from '../config.js'
import { crearServidor } from './server.js'

const args = process.argv.slice(2)
const valor = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto
}

const cfg = cargarConfig()
const puerto = Number(valor('puerto', process.env.CERROJO_MCP_PORT ?? '8788'))
const host = valor('host', process.env.CERROJO_MCP_HOST ?? '127.0.0.1')

/**
 * One server and one transport per request, torn down when the response closes.
 *
 * Stateless is what the MCP spec calls this, and here it is also the security
 * property worth having: two anonymous callers never share a connection, an
 * object or a WDK session, so nothing one of them does can be observed or
 * inherited by the next. It costs a few milliseconds of setup per call, which is
 * nothing next to the sessions the tools open anyway.
 */
async function atender (req, res) {
  const servidor = crearServidor()
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  transporte.onerror = (err) => console.error('[mcp] transporte:', err?.stack ?? err)

  res.on('close', () => {
    transporte.close().catch(() => {})
    servidor.close().catch(() => {})
  })

  await servidor.connect(transporte)
  await transporte.handleRequest(req, res)
}

/** What a browser gets if a person opens the URL by hand. */
const tarjeta = {
  servicio: 'cerrojo-mcp',
  version: '0.1.0',
  transporte: 'streamable-http',
  endpoint: '/mcp',
  red: cfg.network,
  token: cfg.token,
  herramientas: 9,
  puede_enviar: false,
  puede_aprobar: false,
  nota: 'Ninguna herramienta firma, envia ni aprueba. Aprobar existe solo en la CLI, donde lo teclea una persona.'
}

const api = createServer((req, res) => {
  // An MCP client is not a browser, but the inspector is, and a preflight that
  // fails looks exactly like a server that is down.
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type, mcp-session-id, mcp-protocol-version, accept, authorization')
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('access-control-expose-headers', 'mcp-session-id')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const ruta = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/'

  if (ruta === '/mcp') {
    atender(req, res).catch((err) => {
      console.error('[mcp] atender fallo:', err?.stack ?? err)
      if (res.headersSent) return res.end()
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'E_MCP', message: err.message } }))
    })
    return
  }

  res.writeHead(ruta === '/' ? 200 : 404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(ruta === '/' ? tarjeta : { error: { code: 'E_RUTA', message: 'El endpoint MCP es /mcp' } }, null, 2))
})

api.listen(puerto, host, () => {
  console.log(`\n  cerrojo MCP (streamable http) en http://${host}:${puerto}/mcp`)
  console.log(`  red ${cfg.network} · token ${cfg.token.symbol} ${cfg.token.address}`)
  console.log('  9 herramientas. Ninguna envia, ninguna aprueba, ninguna ve la seed.\n')
})

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    api.close(() => process.exit(0))
  })
}
