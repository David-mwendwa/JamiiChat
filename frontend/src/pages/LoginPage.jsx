import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import LoginForm from '../components/auth/LoginForm.jsx';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AuthLayout>
      <h1 className="text-2xl sm:text-3xl">Sign in to JamiiChat</h1>
      <p className="mt-2 text-sm text-muted">
        Use your username or email address.
      </p>

      <div className="mt-8">
        <LoginForm
          onSuccess={(account) => {
            // `from` is only honoured when it was captured for this same
            // account — it exists so an expired session returns you where you
            // were, not so a different person inherits the last one's
            // location.
            const from = location.state?.from;
            const forHandle = location.state?.forHandle;
            const resume = from && (!forHandle || forHandle === account.handle);
            navigate(resume ? from : '/', { replace: true });
          }}
        />
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link
          to="/register"
          state={location.state}
          className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
};

export default LoginPage;
