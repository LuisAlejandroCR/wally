import { auth } from '@clerk/nextjs/server'
import { SignInButton } from '@clerk/nextjs'
import { OperatorPanel } from '@/components/OperatorPanel'
import { liveApiUrl } from '@/lib/cerrojo'
import { Cta, NextSteps, Page, PageHeader, Section } from '@/components/Page'
import { Help } from '@/components/Help'

export const dynamic = 'force-dynamic'

export default async function OperatorPage () {
  const { userId } = await auth()
  const liveConfigured = liveApiUrl() !== null

  return (
    <Page>
      <PageHeader
        eyebrow="Operator · dry-run only"
        title={
          <>
            Run a payroll <em>through the lock</em>
          </>
        }
        lead="Reading is public. Running a payroll spends the day’s accumulator and writes a receipt, so it sits behind a sign-in."
      />

      {userId ? (
        <Section>
          <OperatorPanel liveConfigured={liveConfigured} />
        </Section>
      ) : (
        <Section
          tone="panel"
          title="Sign in to run a payroll"
          lead={
            <>
              One click with Google. Every recorded verdict on The proof is open without an account — the receipt,
              the injection comparison, the agent transcript and the five policies. What needs the account is asking
              the live engine something new, here or with the probe on The proof.
              <Help title="Why an account at all?">
                To keep one shared engine from being run by everyone at once. It widens nothing: this deployment has
                no endpoint that executes, so the worst an authenticated run can do is write a dry-run receipt and
                move the day&apos;s counter.
              </Help>
            </>
          }
        >
          <SignInButton mode="modal">
            <button className="rounded-full bg-gold px-5 py-2.5 font-semibold text-navy shadow-[0_14px_30px_-12px_rgba(233,162,59,0.75)] transition-colors hover:bg-gold-2">
              Sign in with Google
            </button>
          </SignInButton>
        </Section>
      )}

      <NextSteps>
        <Cta href="/proof" tone="primary">
          Read a recorded receipt →
        </Cta>
        <Cta href="/proof#policies">The five policies</Cta>
      </NextSteps>
    </Page>
  )
}
