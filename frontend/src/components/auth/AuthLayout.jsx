import { Link } from 'react-router-dom';
import Logo from '../ui/Logo.jsx';

// The branding half only needed changing when the product's own pitch
// changes, so it's kept short and distinct from LandingPage's four cards
// rather than re-describing the whole app to someone already mid sign-in.
const HIGHLIGHTS = [
  ['Real-time, not refreshed', 'Messages, typing and read receipts arrive over an open connection.'],
  ['Threads that hold together', 'Every reply keeps the conversation it came from.'],
  ['You decide who sees what', 'Private accounts, block and mute — both directions.'],
];

// Shared shell for LoginPage and RegisterPage: an ambient branding panel on
// wide screens, collapsing to just the form card below `lg` — the same
// breakpoint LandingPage's hero collapses at, so the whole auth-adjacent
// experience reads as one design rather than two unrelated pages.
const AuthLayout = ({ children }) => (
  <div className="relative min-h-screen overflow-hidden bg-canvas">
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-32 -top-24 h-96 w-96 animate-float rounded-full bg-primary-500/20 blur-3xl" />
      <div
        className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] animate-float rounded-full bg-secondary-400/10 blur-3xl"
        style={{ animationDelay: '-7s' }}
      />
    </div>

    <div className="relative mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
      {/* `grid-cols-1` below `lg` is load-bearing, not decorative: Tailwind's
          numbered grid-cols utilities use `minmax(0, 1fr)` tracks specifically
          so a track can't grow past the container. Leaving the mobile case on
          the implicit default (no `grid-template-columns` at all) lets Chrome
          size that single auto track to the card's own preferred width —
          effectively its `max-w-md` cap — regardless of viewport, which is
          what pushed the whole card off the right edge of a narrow phone. */}
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
        <div className="hidden min-w-0 lg:block">
          <Link to="/" aria-label="Back to JamiiChat" className="inline-block w-fit">
            <Logo className="h-14 w-14" />
          </Link>
          <h2 className="mt-8 text-4xl leading-[1.05]">
            Post. Follow.
            <br />
            <span className="text-primary-600 dark:text-primary-400">Talk.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(([title, body]) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                <span>
                  <p className="font-heading text-[0.9375rem] font-bold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-muted">{body}</p>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full min-w-0 max-w-md">
          <Link to="/" aria-label="Back to JamiiChat" className="mb-6 inline-block w-fit lg:hidden">
            <Logo className="h-11 w-11" />
          </Link>
          <div className="card shadow-lift p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  </div>
);

export default AuthLayout;
