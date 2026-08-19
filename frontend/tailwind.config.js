const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Violet — the one major hue no other project in this workspace uses,
        // and it reads as social rather than commercial.
        primary: colors.violet,
        // Amber is rationed: unread badges and live indicators only, so the
        // one saturated colour on screen always means "something happened".
        secondary: colors.amber,
        dark: colors.slate,
        success: colors.emerald,
        danger: colors.rose,

        // Semantic surfaces, driven by CSS variables so a component is written
        // once and both themes stay coherent. The neutrals carry a slight
        // violet bias rather than being pure grey — a neutral that shares the
        // accent's temperature reads as chosen instead of inherited.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
      },
      maxWidth: {
        // The feed column never changes width, so a post is composed at
        // exactly the width it is read at.
        feed: '620px',
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 12 30 / 0.04), 0 4px 16px -8px rgb(15 12 30 / 0.10)',
        lift: '0 12px 32px -16px rgb(76 29 149 / 0.30), 0 2px 8px -4px rgb(15 12 30 / 0.10)',
        pop: '0 20px 48px -20px rgb(76 29 149 / 0.45)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        dot: {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.45' },
          '30%': { transform: 'translateY(-3px)', opacity: '1' },
        },
        // iMessage's "slam": the bubble arrives oversized and slightly askew,
        // then snaps down past its resting size before settling. The overshoot
        // is what sells the impact — a plain scale-up just reads as a fade.
        slam: {
          '0%': { transform: 'scale(1.6) rotate(-4deg)', opacity: '0' },
          '45%': { transform: 'scale(0.94) rotate(1deg)', opacity: '1' },
          '70%': { transform: 'scale(1.03) rotate(0deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        // Ambient drift for the landing page's background field, not a UI
        // affordance — slow and small enough to read as atmosphere, never as
        // something asking to be looked at.
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(3%, -4%) scale(1.05)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-down': 'slideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        pop: 'pop 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        slam: 'slam 0.42s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        shimmer: 'shimmer 1.4s linear infinite',
        dot: 'dot 1.2s ease-in-out infinite',
        float: 'float 14s ease-in-out infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
