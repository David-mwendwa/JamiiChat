import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/index.js';
import { AUTH_EXPIRED_EVENT } from '../api/apiClient.js';
import {
  getToken,
  setToken,
  clearToken,
  getCachedUser,
  setCachedUser,
  clearCachedUser,
} from '../lib/storage.js';
import { clearFeedCache } from '../hooks/useInfiniteFeed.js';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  // Seeded from the cache so a returning reader's own screen paints on the
  // first frame, with no network in the way. The server still decides whether
  // this session is real; the check below runs anyway and corrects it.
  const [user, setUser] = useState(() => (getToken() ? getCachedUser() : null));
  const [token, setTokenState] = useState(() => getToken());
  /*
   * Distinct from "no user": until the stored token has been checked we do not
   * know whether there is a session, and rendering the signed-out view in the
   * meantime would flash the landing page at a signed-in reader.
   *
   * This is now only true in the genuinely cold case — a stored token with no
   * cached user, so there is nothing to paint and guessing would flash the
   * wrong screen. With a cache present the app renders straight away and the
   * check happens underneath it, which is what removes the free tier's cold
   * start (~23s, measured) from the critical path instead of staring at it.
   */
  const [checking, setChecking] = useState(() => Boolean(getToken()) && !getCachedUser());

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!getToken()) {
        setChecking(false);
        return;
      }
      try {
        const { data } = await authApi.me();
        // Revalidation is also what keeps the cache honest: a display name or
        // avatar changed on another device lands here.
        setCachedUser(data.user);
        if (!cancelled) setUser(data.user);
      } catch (error) {
        // A failed request is not a failed session. The API sleeps on the free
        // tier and phones lose signal; treating either as "signed out" would
        // throw away a valid session and drop the reader on the landing page
        // for being offline. Only an answer from the server — 401, handled by
        // the interceptor's AUTH_EXPIRED event — ends a session.
        if (error?.response?.status === 401) {
          clearToken();
          clearCachedUser();
          if (!cancelled) {
            setTokenState(null);
            setUser(null);
          }
        }
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
      clearCachedUser();
      setUser(null);
      setTokenState(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  /*
   * The setter every consumer gets, so the cache cannot drift from the state.
   *
   * SettingsPage writes the user here after a profile save. With a bare
   * setUser, the state was right and the cache still held the previous name
   * and avatar — which nothing revealed until the next refresh painted the old
   * profile from cache for a frame before revalidation corrected it. Anything
   * that changes the user goes through this.
   */
  const updateUser = useCallback((next) => {
    setUser(next);
    if (next) setCachedUser(next);
    else clearCachedUser();
  }, []);

  const adopt = useCallback((data) => {
    // Signing in as someone else must never paint their screen with the
    // previous account's cached feed for even a moment — the test-account
    // switcher on the login page makes rapid account-hopping routine.
    clearFeedCache();
    setToken(data.token);
    setCachedUser(data.user);
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

  const resetPassword = useCallback(
    async (token, payload) => {
      const { data } = await authApi.resetPassword(token, payload);
      // Signs the token holder straight in — they just proved control of the
      // account by opening the emailed link.
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
    clearCachedUser();
    clearFeedCache();
    setUser(null);
    setTokenState(null);
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      token,
      checking,
      login,
      register,
      resetPassword,
      logout,
      setUser: updateUser,
    }),
    [user, token, checking, login, register, resetPassword, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
