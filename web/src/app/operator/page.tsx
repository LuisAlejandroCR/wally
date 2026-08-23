import { auth } from '@clerk/nextjs/server'
import { SignInButton } from '@clerk/nextjs'
import { OperatorPanel } from '@/components/OperatorPanel'
import { liveApiUrl } from '@/lib/cerrojo'

export const dynamic = 'force-dynamic'

export default async function OperatorPage () {
  const { userId } = await auth()
  const liveConfigured = liveApiUrl() !== null

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Operator</h1>
        <p className="max-w-3xl text-lg text-muted">
          The demo pages are public because a verdict is worth nothing if nobody can check it. Running a payroll is
          not: it consumes the day&apos;s accumulator and writes a receipt, so it sits behind a sign-in.
        </p>
        <p className="max-w-3xl text-sm text-muted">
          Signing in does not widen what anyone can do. There is no endpoint here that sends funds — the caps, the
          allowlist and the token pin are enforced by the WDK policy engine either way, and an account cannot talk them
          down.
        </p>
      </section>

      {userId ? (
        <OperatorPanel liveConfigured={liveConfigured} />
      ) : (
        <section className="rounded-xl border border-border bg-panel p-6">
          <h2 className="text-xl font-bold">Sign in to run a payroll</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Every other page — the run, the injection comparison and the policies — is open without an account.
          </p>
          <div className="mt-4">
            <SignInButton mode="modal">
              <button className="rounded-lg bg-blue px-4 py-2 font-semibold text-on-blue transition-opacity hover:opacity-90">
                Sign in
              </button>
            </SignInButton>
          </div>
        </section>
      )}
    </div>
  )
}
