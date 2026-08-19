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
