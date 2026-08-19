import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import { authApi } from '../api/index.js';
import { errorMessage } from '../api/apiClient.js';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await authApi.forgotPassword(email.trim());
      setResult(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not send the reset email'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the email on your account and we'll send a link to choose a new password.
      </p>

      <div className="mt-8">
        {result ? (
          <div className="space-y-4">
            <p role="status" className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
              {result.message}
            </p>
            {/* Only ever present outside production, when no mail server sent
                the message — see the backend's forgotPassword controller. */}
            {result.devResetUrl && (
              <div className="rounded-xl border border-dashed border-line-strong p-4 text-sm">
                <p className="font-semibold">{result.devNote}</p>
                <Link to={result.devResetUrl.replace(/^https?:\/\/[^/]+/, '')} className="mt-2 block break-all font-semibold text-primary-600 hover:underline dark:text-primary-400">
                  {result.devResetUrl}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
