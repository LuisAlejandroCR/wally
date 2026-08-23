import { SignUp } from '@clerk/nextjs'

export default function SignUpPage () {
  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-bold">Create an operator account</h1>
        <p className="mt-2 text-muted">
          An account lets you run a payroll against a live engine, in dry-run. It does not raise a cap, add a
          recipient or unlock a send — none of those are reachable from this site.
        </p>
      </div>
      <SignUp />
    </div>
  )
}
