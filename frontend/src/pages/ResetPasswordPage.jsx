import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { errorMessage } from '../api/apiClient.js';

const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, { password, confirmPassword });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not reset your password'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">This link is good for 30 minutes from when it was sent.</p>

      <div className="mt-8">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className="field"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
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
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/password/forgot" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Request a new link
        </Link>
      </p>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
