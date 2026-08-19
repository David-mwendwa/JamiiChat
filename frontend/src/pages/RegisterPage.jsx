import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import useDebounce from '../hooks/useDebounce.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { authApi } from '../api/index.js';
import { errorMessage } from '../api/apiClient.js';

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ displayName: '', handle: '', email: '', password: '' });
  const [handleState, setHandleState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedHandle = useDebounce(form.handle, 400);

  // Checked as it is typed, because discovering the username is taken after
  // filling in the whole form is a bad way to find out.
  useEffect(() => {
    const handle = debouncedHandle.trim().toLowerCase();
    if (!handle) return setHandleState(null);
    if (!HANDLE_PATTERN.test(handle)) return setHandleState('invalid');

    let cancelled = false;
    setHandleState('checking');
    authApi
      .handleAvailable(handle)
      .then(({ data }) => !cancelled && setHandleState(data.available ? 'free' : 'taken'))
      .catch(() => !cancelled && setHandleState(null));

    return () => {
      cancelled = true;
    };
  }, [debouncedHandle]);

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        ...form,
        handle: form.handle.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
      });
      // A brand-new account has no prior session to resume, but the visitor
      // may have arrived here from an auth-gated action (tried to repost while
      // signed out, chose "Create an account" instead of signing in) — `from`
      // carries that same intent through registration the way LoginPage
      // carries it through sign-in.
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not create that account'));
    } finally {
      setBusy(false);
    }
  };

  const HANDLE_MESSAGES = {
    checking: ['Checking…', 'text-muted'],
    free: ['That username is available', 'text-emerald-600 dark:text-emerald-400'],
    taken: ['That username is taken', 'text-rose-600 dark:text-rose-400'],
    invalid: ['3–20 characters: letters, numbers and underscores', 'text-rose-600 dark:text-rose-400'],
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl">Join JamiiChat</h1>
      <p className="mt-2 text-sm text-muted">
        Pick a username people will know you by.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold">
            Name
          </label>
          <input id="displayName" value={form.displayName} onChange={update('displayName')} required maxLength={50} className="field" />
        </div>

        <div>
          <label htmlFor="handle" className="mb-1.5 block text-sm font-semibold">
            Username
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
              @
            </span>
            <input
              id="handle"
              value={form.handle}
              onChange={(e) => setForm((p) => ({ ...p, handle: e.target.value.toLowerCase() }))}
              required
              className="field pl-8 font-mono"
            />
          </div>
          {handleState && (
            <p className={`mt-1.5 text-xs font-medium ${HANDLE_MESSAGES[handleState][1]}`}>
              {HANDLE_MESSAGES[handleState][0]}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
            Email
          </label>
          <input id="email" type="email" value={form.email} onChange={update('email')} autoComplete="email" required className="field" />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            minLength={8}
            required
            className="field"
          />
          <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || handleState === 'taken'} className="btn-primary w-full py-3">
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          to="/login"
          state={location.state}
          className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default RegisterPage;
