import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/index.js';
import { AUTH_EXPIRED_EVENT } from '../api/apiClient.js';
import { getToken, setToken, clearToken } from '../lib/storage.js';
import { clearFeedCache } from '../hooks/useInfiniteFeed.js';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => getToken());
  // Distinct from "no user": until the stored token has been checked we do not
  // know whether there is a session, and rendering the signed-out view in the
  // meantime would flash the landing page at a signed-in reader.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!getToken()) {
        setChecking(false);
        return;
      }
      try {
        const { data } = await authApi.me();
        if (!cancelled) setUser(data.user);
      } catch {
        clearToken();
        if (!cancelled) setTokenState(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // The interceptor fires this when a request comes back 401, so a session that
  // expires in another tab clears here too.
  useEffect(() => {
    const onExpired = () => {
      clearFeedCache();
      setUser(null);
      setTokenState(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const adopt = useCallback((data) => {
    // Signing in as someone else must never paint their screen with the
    // previous account's cached feed for even a moment — the test-account
    // switcher on the login page makes rapid account-hopping routine.
    clearFeedCache();
    setToken(data.token);
    setTokenState(data.token);
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (identifier, password) => {
      const { data } = await authApi.login({ identifier, password });
      adopt(data);
      return data.user;
    },
    [adopt]
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await authApi.register(payload);
      adopt(data);
      return data.user;
    },
    [adopt]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The local session is cleared either way — a failed logout request must
      // not leave someone signed in on a shared machine.
    }

    // Leave the protected route BEFORE clearing the session. Clearing first
    // leaves RequireAuth mounted on, say, /messages/<id>; it then redirects to
    // /login carrying that path as `from`, and the next person to sign in gets
    // sent straight to the previous account's conversation. `replace` also
    // keeps Back from returning to a signed-in screen on a shared machine.
    navigate('/', { replace: true });

    clearToken();
    clearFeedCache();
    setUser(null);
    setTokenState(null);
  }, [navigate]);

  const value = useMemo(
    () => ({ user, token, checking, login, register, logout, setUser }),
    [user, token, checking, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
