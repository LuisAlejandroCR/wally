import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { liveApiUrl } from '@/lib/cerrojo'

/**
 * The only bridge between this deployment and a running engine.
 *
 * It forwards three read-or-simulate calls and nothing else. There is no
 * proxied path that sends funds, because the Cerrojo API has no such endpoint:
 * `--live` exists only in the CLI and needs two explicit flags together.
 */
const ALLOWED: Record<string, { path: string; method: 'GET' | 'POST' }> = {
  health: { path: '/salud', method: 'GET' },
  policies: { path: '/politicas', method: 'GET' },
  day: { path: '/estado-diario', method: 'GET' },
  simulate: { path: '/simular', method: 'POST' },
  run: { path: '/correr', method: 'POST' }
}

function fail (status: number, code: string, message: string, suggestion: string) {
  return NextResponse.json({ error: { code, message, suggestion } }, { status })
}

export async function POST (request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  const spec = ALLOWED[action]
  if (!spec) {
    return fail(404, 'E_ACCION', `No proxied action named "${action}".`, `Use one of: ${Object.keys(ALLOWED).join(', ')}.`)
  }

  // Reading is public; making the engine work is not. The gate is here as well
  // as on the page, because a route handler is reachable without the page.
  const { userId } = await auth()
  if (!userId) {
    return fail(
      401,
      'E_SIN_SESION',
      'This action needs a signed-in operator.',
      'Sign in from the Operator page. The public pages need no account.'
    )
  }

  const base = liveApiUrl()
  if (!base) {
    return fail(
      503,
      'E_SIN_MOTOR',
      'This deployment is not wired to a running Cerrojo engine.',
      'Set CERROJO_API_URL to a reachable Cerrojo API and redeploy. Without it the site serves recorded runs only.'
    )
  }

  let body: unknown = undefined
  if (spec.method === 'POST') {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }

  try {
    const upstream = await fetch(base + spec.path, {
      method: spec.method,
      headers: spec.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: spec.method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000)
    })
    const text = await upstream.text()
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
    })
  } catch (err) {
    return fail(
      502,
      'E_MOTOR_INALCANZABLE',
      `The engine did not answer: ${err instanceof Error ? err.message : String(err)}`,
      'Check that the Cerrojo API is running and that the tunnel in CERROJO_API_URL is up.'
    )
  }
}
