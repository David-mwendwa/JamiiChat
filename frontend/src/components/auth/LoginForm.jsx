import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import Spinner from '../ui/Spinner.jsx';
import { useAuth } from '../../context/AuthProvider.jsx';
import { authApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';

// The two accounts worth trying before anyone else stay as one-tap buttons.
// Everything else lives behind the accordion below, fetched on demand — the
// same affordance furniworld and TaliiKE use for a single demo login, widened
// here because testing anything social (a follow, a DM, a live notification)
// needs at least two different people signed in on two different screens.
const DEMOS = [
  { label: 'Demo user', identifier: 'demo@jamii.app', password: 'demo12345' },
  { label: 'Admin', identifier: 'admin@jamii.app', password: 'admin12345' },
];

const TestAccountList = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Fetched once, on first expand — a signed-out visitor who never opens
    // this should not pay for a request they didn't ask for.
    if (next && !accounts && !loading) {
      setLoading(true);
      authApi
        .testAccounts()
        .then(({ data }) => setAccounts(data.items))
        .catch(() => setAccounts([]))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="mt-3 border-t border-line-strong pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
        Every seeded account
        <Icon
          name="chevronDown"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-2 max-h-64 animate-slide-down overflow-y-auto rounded-xl border border-line">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading accounts" />
            </div>
          ) : (
            <ul>
              {accounts?.map((account) => (
                <li key={account.handle}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(account.handle, account.password);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2 text-left transition last:border-b-0 hover:bg-sunken">
                    <Avatar user={account} size="xs" link={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {account.displayName}
                      </span>
                      <span className="handle block truncate text-[0.6875rem]">@{account.handle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

// The identifier/password form itself, shared by the full sign-in page and
// the inline modal an auth-gated action (repost, follow, like…) opens for a
// signed-out reader — `onSuccess` is the only thing that differs between the
// two: the page navigates, the modal resumes whatever the reader was doing.
const LoginForm = ({ onSuccess }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const fill = (nextIdentifier, nextPassword) => {
    setIdentifier(nextIdentifier);
    setPassword(nextPassword);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const account = await login(identifier.trim(), password);
      onSuccess(account);
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-semibold">
            Username or email
          </label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
            className="field"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-semibold">
              Password
            </label>
            <Link to="/password/forgot" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="field"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-line-strong p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Try it without signing up
        </p>
        <div className="mt-2.5 flex gap-2">
          {DEMOS.map((demo) => (
            <button
              key={demo.label}
              type="button"
              onClick={() => fill(demo.identifier, demo.password)}
              className="btn-outline flex-1 py-2 text-[0.8125rem]">
              {demo.label}
            </button>
          ))}
        </div>

        {/* Every other seeded person, for testing anything that needs two
            accounts at once — a follow, a DM, a live notification. */}
        <TestAccountList onPick={fill} />
      </div>
    </div>
  );
};

export default LoginForm;
