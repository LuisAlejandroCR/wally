import { SignIn } from '@clerk/nextjs'

export default function SignInPage () {
  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-bold">Sign in to operate</h1>
        <p className="mt-2 text-muted">
          Only the operator screen needs an account. The run, the injection comparison and the policies are public,
          and no account changes what the policy engine allows.
        </p>
      </div>
      <SignIn />
    </div>
  )
}
