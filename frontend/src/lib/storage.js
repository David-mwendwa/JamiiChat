const TOKEN_KEY = 'jamii:token';
const THEME_KEY = 'jamii:theme';
const FONT_SCALE_KEY = 'jamii:font-scale';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing modes can throw on access rather than returning null.
    return null;
  }
};

export const setToken = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* the session still works for this tab without persistence */
  }
};

export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
};

export const getStoredTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
};

export const setStoredTheme = (theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* theme falls back to the system preference */
  }
};

export const getStoredFontScale = () => {
  try {
    return localStorage.getItem(FONT_SCALE_KEY);
  } catch {
    return null;
  }
};

export const setStoredFontScale = (scale) => {
  try {
    localStorage.setItem(FONT_SCALE_KEY, scale);
  } catch {
    /* the app still renders at the default size for this tab */
  }
};

/*
 * The last signed-in user, cached so a refresh can render immediately.
 *
 * The session used to be restored by holding the entire app behind a spinner
 * until GET /auth/me came back. That is one network round trip on a good day
 * and, on the free hosting tier this deploys to, up to ~23 seconds while the
 * service wakes from sleep — measured. For all of it the reader saw a
 * centred spinner and nothing else, which is indistinguishable from broken.
 *
 * This is display data only (name, handle, avatar), not an authorisation
 * decision. The token is the credential, it already lives in this same
 * storage, and every request is still authorised by the server — a tampered
 * cache buys a stale name on screen for one paint and a 401 immediately
 * after. It is written on sign-in and on every successful revalidation, and
 * cleared on sign-out and on an expired session.
 */
const USER_KEY = 'jamii:user';

export const getCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Unparseable is the same as absent: fall back to the blocking check
    // rather than rendering half a session.
    return null;
  }
};

export const setCachedUser = (user) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* the session still works, it just cannot paint before the API answers */
  }
};

export const clearCachedUser = () => {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nothing to clear */
  }
};
