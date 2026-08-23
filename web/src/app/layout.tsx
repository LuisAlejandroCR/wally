import type { Metadata } from 'next'
import Link from 'next/link'
import { IBM_Plex_Sans, IBM_Plex_Mono, Playfair_Display } from 'next/font/google'
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

// The headings get a display serif so the argument reads like a page rather
// than a dashboard. Only headings: the figures and the tables stay on Plex,
// which is what lines digits up.
const playfair = Playfair_Display({
  variable: '--font-display',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['700', '800']
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
      <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${playfair.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">
          <div className="atmos" aria-hidden="true">
            <span className="atmos-blob atmos-a" />
            <span className="atmos-blob atmos-b" />
            <span className="atmos-grid" />
          </div>

          <header className="sticky top-0 z-20 border-b border-border bg-background/80 shadow-[0_18px_40px_-32px_rgba(18,41,79,0.55)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
              <Link href="/" className="flex items-center gap-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold/60 bg-gold-bg text-navy"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
                    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="display text-xl font-bold">Cerrojo</span>
                  <span className="hidden text-xs text-muted sm:inline">The agent proposes. The lock decides.</span>
                </span>
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
                    <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-gold-2">
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

          <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>

          <footer className="relative z-10 border-t border-border bg-panel/80 backdrop-blur">
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
