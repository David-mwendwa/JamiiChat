import { createContext, lazy, Suspense, useCallback, useContext, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from './AuthProvider.jsx';

/*
 * The sign-in form, fetched when the gate first opens.
 *
 * This provider wraps the whole app, so a static import put the form — and the
 * avatar rendering it uses for the test-account list — into the entry chunk,
 * where every reader downloaded it before first paint for a modal that opens
 * only when a signed-out visitor tries to like or reply to something. Modal
 * itself stays a static import: AppLayout uses it for the composer, so it is
 * in the entry bundle either way.
 */
const LoginForm = lazy(() => import('../components/auth/LoginForm.jsx'));

const AuthGateContext = createContext(null);

export const useAuthGate = () => {
  const context = useContext(AuthGateContext);
  if (!context) throw new Error('useAuthGate must be used inside AuthGateProvider');
  return context;
};

// Fronts every auth-gated action — repost, like, bookmark, reply, follow —
// behind one gate. Signed in, `requireAuth` just runs the action. Signed out,
// it used to send the reader to a whole separate /login page, which cost them
// the post they were looking at and, worse, gave up whatever they had typed
// into a reply. Holding the action here and opening sign-in as a modal on top
// of the same screen means it resumes the instant sign-in succeeds — the
// reader never actually leaves what they were doing.
export const AuthGateProvider = ({ children }) => {
  const { user } = useAuth();
  const [pendingAction, setPendingAction] = useState(null);

  const requireAuth = useCallback(
    (action) => {
      if (user) {
        action();
        return true;
      }
      // Stored as a thunk — `useState(() => fn)` would call it immediately.
      setPendingAction(() => action);
      return false;
    },
    [user]
  );

  const close = () => setPendingAction(null);

  return (
    <AuthGateContext.Provider value={{ requireAuth }}>
      {children}
      <Modal open={Boolean(pendingAction)} onClose={close} title="Sign in to continue">
        <Suspense
          fallback={
            <div className="flex justify-center py-8">
              <Spinner label="Loading sign in" />
            </div>
          }>
          <LoginForm
            onSuccess={() => {
              const action = pendingAction;
              setPendingAction(null);
              action?.();
            }}
          />
        </Suspense>
      </Modal>
    </AuthGateContext.Provider>
  );
};

export default AuthGateProvider;
