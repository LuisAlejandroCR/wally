import type { Metadata } from 'next'
import Link from 'next/link'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import './globals.css'
import { liveApiUrl } from '@/lib/cerrojo'

// IBM Plex is the fintech pairing: it reads as a bank statement rather than a
// startup landing page, and the mono cut lines up digits column by column.
const plexSans = IBM_Plex_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
})
const plexMono = IBM_Plex_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600']
})

export const metadata: Metadata = {
  title: 'Cerrojo — the agent proposes, the lock decides',
  description:
    'A payroll agent built on Tether WDK whose spending limits do not live in the prompt. Every verdict on this page came out of the WDK policy engine.'
}

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/run', label: 'The run' },
  { href: '/injection', label: 'Injection test' },
  { href: '/policies', label: 'Policies' },
  { href: '/operator', label: 'Operator' }
]

export default function RootLayout ({ children }: LayoutProps<'/'>) {
  const live = liveApiUrl() !== null

  // The sign-in surfaces borrow the page palette so the modal does not arrive as
  // a stock white card in the middle of a cream page. Names verified against the
  // installed @clerk/react appearance variables.
  const clerkAppearance = {
    variables: {
      colorBackground: '#fffdf8',
      colorForeground: '#24211c',
      colorPrimary: '#1b5fbf',
      colorInput: '#fffdf8',
      colorInputForeground: '#24211c',
      colorMutedForeground: '#6b6355',
      colorBorder: '#9a8563',
      colorDanger: '#b3261e',
      colorSuccess: '#1f7a4c',
      colorWarning: '#8a5a00',
      borderRadius: '0.6rem'
    }
  }

  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-panel/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
              <Link href="/" className="flex items-baseline gap-3">
                <span className="text-xl font-bold tracking-tight">Cerrojo</span>
                <span className="hidden text-sm text-muted sm:inline">The agent proposes. The lock decides.</span>
              </Link>

              <nav className="flex flex-wrap items-center gap-1 text-sm">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-panel-high hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto flex items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                    live ? 'border-green/40 bg-green-bg text-green' : 'border-border bg-panel-high text-muted'
                  }`}
                >
                  {live ? 'live engine' : 'recorded run'}
                </span>

                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button className="rounded-lg border border-border bg-panel-high px-3 py-1.5 text-sm font-semibold transition-colors hover:text-foreground">
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="rounded-lg bg-blue px-3 py-1.5 text-sm font-semibold text-on-blue transition-opacity hover:opacity-90">
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>

          <footer className="border-t border-border bg-panel">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
              <p>Dry-run only. No page here can send funds — no endpoint exists that does.</p>
              <a
                className="text-blue hover:underline"
                href="https://github.com/LuisAlejandroCR/wally"
                target="_blank"
                rel="noreferrer"
              >
                Source on GitHub ↗
              </a>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  )
}
