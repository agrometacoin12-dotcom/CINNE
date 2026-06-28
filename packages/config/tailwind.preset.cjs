/**
 * Shared Tailwind preset encoding the CinneTemple design system
 * (Netflix-style + Liquid Glass). Consumed by apps/web and packages/ui.
 * See docs/UI_DESIGN.md for the canonical tokens.
 */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { base: '#0A0A0B', elevated: '#141417' },
        brand: { DEFAULT: '#E50914', accent: '#FF3B30' },
        glass: {
          fill: 'rgba(255,255,255,0.08)',
          fillLight: 'rgba(255,255,255,0.55)',
          border: 'rgba(255,255,255,0.18)',
          highlight: 'rgba(255,255,255,0.25)',
        },
      },
      borderRadius: { glass: '16px' },
      backdropBlur: { glass: '24px', glassStrong: '40px' },
      boxShadow: { glass: '0 8px 32px rgba(0,0,0,0.45)' },
      transitionTimingFunction: { glass: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
