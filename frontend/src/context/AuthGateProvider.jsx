import { createContext, useCallback, useContext, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import LoginForm from '../components/auth/LoginForm.jsx';
import { useAuth } from './AuthProvider.jsx';

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
        <LoginForm
          onSuccess={() => {
            const action = pendingAction;
            setPendingAction(null);
            action?.();
          }}
        />
      </Modal>
    </AuthGateContext.Provider>
  );
};

export default AuthGateProvider;
