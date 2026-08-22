import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import Logo from '../components/ui/Logo.jsx';
import cn from '../lib/cn.js';

// A four-beat script for the mock conversation below, timed in ms from the
// start of one loop. Reuses the app's real motion — the slam animation a sent
// message gets, the same typing dots, the same tick progression a read
// receipt goes through — so the hero demonstrates the product rather than
// decorating around it.
const SCRIPT = [
  { at: 300, action: 'show', from: 'them' },
  { at: 1900, action: 'typing' },
  { at: 3100, action: 'show', from: 'me' },
  { at: 3700, action: 'tick', state: 'delivered' },
  { at: 4600, action: 'tick', state: 'read' },
  { at: 7200, action: 'reset' },
];
const LOOP_MS = 7800;

const THEM = { displayName: 'Amina', handle: 'amina' };
const ME = { displayName: 'You', handle: 'you' };

const Tick = ({ state }) => (
  <svg viewBox="0 0 16 12" className={cn('h-2.5 w-3.5', state === 'read' ? 'text-sky-300' : 'text-primary-200')} fill="none">
    <path d="M1 6l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    {state !== 'sent' && (
      <path d="M6 6l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const TypingDots = () => (
  <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2.5">
    {[0, 1, 2].map((i) => (
      <span key={i} className="h-1.5 w-1.5 animate-dot rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
    ))}
  </span>
);

// A tiny scripted conversation, not a screenshot — it demonstrates delivery,
// read receipts and the slam-on-send effect directly, on a loop, without
// needing anyone signed in to see it happen.
const LiveMock = () => {
  const [step, setStep] = useState(-1);
  const [tick, setTick] = useState('sent');
  const reduced = useRef(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );

  useEffect(() => {
    if (reduced.current) {
      setStep(2);
      setTick('read');
      return undefined;
    }

    const apply = ({ action, state }) => {
      if (action === 'reset') {
        setStep(-1);
        setTick('sent');
      } else if (action === 'typing') {
        setStep(1);
      } else if (action === 'show') {
        setStep(state === 'them' ? 0 : 2);
      } else if (action === 'tick') {
        setTick(state);
      }
    };

    const run = () => SCRIPT.map((beat) => setTimeout(() => apply(beat), beat.at));

    let timers = run();
    const interval = setInterval(() => {
      timers.forEach(clearTimeout);
      timers = run();
    }, LOOP_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="card shadow-lift w-full max-w-sm overflow-hidden">
      <div className="divider flex items-center gap-2.5 px-4 py-3">
        <Avatar user={THEM} size="sm" link={false} online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{THEM.displayName}</p>
          <p className="handle truncate text-[0.6875rem]">Active now</p>
        </div>
      </div>

      <div className="flex h-48 flex-col justify-end gap-2 bg-canvas px-4 py-4">
        {step >= 0 && (
          <div className="flex justify-start">
            <p className="max-w-[80%] origin-bottom-left animate-slam rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2.5 text-[0.875rem]">
              Did you catch the derby last night? 🔥
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="flex justify-end">
            <TypingDots />
          </div>
        )}

        {step >= 2 && (
          <div className="flex flex-col items-end gap-1">
            <p className="max-w-[80%] origin-bottom-right animate-slam rounded-2xl rounded-br-md bg-primary-600 px-3.5 py-2.5 text-[0.875rem] text-white">
              Watched the highlights this morning, unreal finish
            </p>
            <span className="flex items-center gap-1 pr-1 text-[0.6875rem] text-muted">
              {tick === 'read' ? 'Read' : 'Delivered'}
              <Tick state={tick} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Shown only to a signed-out visitor at the root. Signed in, the same path is
// the home feed.
const LandingPage = () => (
  <div className="relative overflow-hidden">
    {/* Ambient colour field, not a UI element — two soft blurred fields that
        drift slowly behind the hero. Skipped entirely for reduced motion via
        the global media query in index.css, which zeroes animation duration. */}
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-32 -top-24 h-96 w-96 animate-float rounded-full bg-primary-500/20 blur-3xl" />
      <div
        className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] animate-float rounded-full bg-secondary-400/10 blur-3xl"
        style={{ animationDelay: '-7s' }}
      />
    </div>

    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-6 py-10 lg:gap-12 lg:py-12">
      {/* The hero and the chat mock share one row — a 3:2 split rather than an
          even 1:1 one, because the mock's own card tops out at `max-w-sm`
          (24rem): an even split on a 1152px container hands it a track far
          wider than it will ever fill, which is what read as disproportionate.
          A narrower, tailored track lets the card sit centred in space that
          actually belongs to it instead of adrift in a mostly-empty half. */}
      <div className="grid items-center gap-10 lg:grid-cols-[3fr_2fr] lg:gap-16">
        {/* Centred on mobile, left-aligned from `lg` up — stacked below the
            hero, a left-flush block reads as misaligned against everything
            else on a narrow screen centring by default. */}
        <div className="animate-slide-up text-center lg:text-left">
          <Logo className="mx-auto h-14 w-14 lg:mx-0" />
          <h1 className="mt-8 text-4xl leading-[1.05] sm:text-5xl lg:text-[3.75rem] lg:leading-[1.03]">
            Post. Follow.
            <br />
            <span className="text-primary-600 dark:text-primary-400">Talk.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[1.0625rem] leading-relaxed text-ink-soft lg:mx-0">
            JamiiChat is a place to say what you think and hear back about it — replies, direct
            messages and notifications that arrive the moment they happen.
          </p>

          {/* whitespace-nowrap: these labels must never break across two lines,
              which is what happened when the hero was rendered in a narrow column. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link to="/register" className="btn-primary whitespace-nowrap px-6 py-2.5">
              Create an account
            </Link>
            <Link to="/login" className="btn-outline whitespace-nowrap px-6 py-2.5">
              Sign in
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted">
            Just looking?{' '}
            <Link to="/explore" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
              Browse without an account
            </Link>
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <LiveMock />
        </div>
      </div>

      {/* A row of four, not a stacked list — the same four cards read as a
          tall fifth screenful stacked at `space-y-3`, which is exactly what
          forced a scroll on a page meant to fit in one view. Laid out side by
          side from `sm` up, the whole page holds its height instead. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {[
          // Each icon is the exact one that name already carries elsewhere in
          // the app (NavRail's Messages/Home/Admin, PostActions' Reply) —
          // reusing that vocabulary rather than picking a fresh glyph means a
          // signed-in visitor recognises the icon again, not just the word.
          ['mail', 'Live conversations', 'Messages, typing indicators and read receipts arrive over an open connection, not a refresh.'],
          ['home', 'A timeline you control', 'Follow who you want, mute what you do not, and block anyone — in both directions.'],
          ['reply', 'Replies that read as threads', 'Every reply keeps the conversation it came from, so a link is never a fragment.'],
          ['shield', 'Moderation that is a decision', 'Reports go to a person, and what they decide is recorded separately from what was reported.'],
        ].map(([icon, title, body], i) => (
          <li
            key={title}
            className="animate-slide-up rounded-2xl border border-line p-4 opacity-0 [animation-fill-mode:forwards] dark:border-line"
            style={{ animationDelay: `${150 + i * 90}ms` }}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400">
              <Icon name={icon} className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <h2 className="mt-3 text-base">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export default LandingPage;
