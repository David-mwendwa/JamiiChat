import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getStoredTheme,
  setStoredTheme,
  getStoredFontScale,
  setStoredFontScale,
} from '../lib/storage.js';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
};

const systemPrefersDark = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

// Multipliers, not absolute sizes — index.css owns the base they multiply.
//
// Two reasons. The base is a percentage, so `1` means "whatever this reader's
// browser or OS is already set to" and the control stacks with an
// accessibility setting rather than overriding it; pinning `16px` would
// silently cancel one. And the base is a step smaller below `sm`, so
// "Default" means *this device's* default — a phone starts smaller than a
// desktop without the reader choosing, and the steps still move relative to
// wherever they started.
//
// These must stay unitless: index.css multiplies them by a percentage, and
// `calc(87.5% * 100%)` is invalid, which silently collapses the root back to
// the browser default.
//
// Everything downstream is sized in rem (Tailwind's scale already is, and the
// app's own type was converted from px for exactly this), so one root value
// scales type and spacing together instead of leaving text floating in
// fixed-size boxes.
export const FONT_SCALES = {
  smaller: { label: 'Smaller', value: '0.75' },
  small: { label: 'Small', value: '0.875' },
  default: { label: 'Default', value: '1' },
  large: { label: 'Large', value: '1.125' },
  larger: { label: 'Larger', value: '1.25' },
};

export const ThemeProvider = ({ children }) => {
  // Three states, not two: an explicit choice wins, and 'system' follows the OS
  // as it changes rather than sampling it once at load.
  const [theme, setTheme] = useState(() => getStoredTheme() ?? 'system');
  const [fontScale, setFontScale] = useState(
    () => getStoredFontScale() ?? 'default'
  );

  useEffect(() => {
    const { value } = FONT_SCALES[fontScale] ?? FONT_SCALES.default;
    // Sets the multiplier only; index.css owns the per-breakpoint base, which
    // is what lets the phone default sit a step below the desktop one without
    // this having to know the viewport (and without breaking on resize).
    document.documentElement.style.setProperty('--font-scale', value);
  }, [fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
      root.classList.toggle('dark', dark);
    };

    apply();

    if (theme !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next) => {
        setTheme(next);
        setStoredTheme(next);
      },
      fontScale,
      setFontScale: (next) => {
        setFontScale(next);
        setStoredFontScale(next);
      },
    }),
    [theme, fontScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeProvider;
