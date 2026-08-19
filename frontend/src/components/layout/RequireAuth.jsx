import { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider.jsx';
import Spinner from '../ui/Spinner.jsx';

const RequireAuth = ({ children, roles }) => {
  const { user, checking } = useAuth();
  const location = useLocation();

  // Remembered across the render in which `user` becomes null, which is the
  // only moment the redirect below can read it.
  const lastHandle = useRef(null);
  if (user) lastHandle.current = user.handle;

  // Until the stored token has been checked, "no user" is not yet a fact —
  // redirecting here would bounce a signed-in reader to the login page on
  // every refresh.
  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );

  // `forHandle` records who this path belonged to, so the sign-in screen can
  // tell "your session expired, carry on" from "someone else is signing in".
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname, forHandle: lastHandle.current }}
        replace
      />
    );

  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
};

export default RequireAuth;
