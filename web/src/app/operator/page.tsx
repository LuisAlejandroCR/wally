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
          The demo pages are public: a verdict nobody can check is worth nothing. Running a payroll spends the
          day&apos;s accumulator and writes a receipt, so it sits behind a sign-in.
        </p>
        <p className="max-w-3xl text-sm text-muted">
          An account widens nothing. No endpoint here sends funds, and the caps, allowlist and token pin are
          enforced by the WDK policy engine either way.
        </p>
      </section>

      {userId ? (
        <OperatorPanel liveConfigured={liveConfigured} />
      ) : (
        <section className="rounded-xl border border-border bg-panel p-6">
          <h2 className="text-xl font-bold">Sign in to run a payroll</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Every other page is open without one.
          </p>
          <div className="mt-4">
            <SignInButton mode="modal">
              <button className="rounded-full bg-gold px-4 py-2 font-semibold text-navy transition-colors hover:bg-gold-2">
                Sign in
              </button>
            </SignInButton>
          </div>
        </section>
      )}
    </div>
  )
}
