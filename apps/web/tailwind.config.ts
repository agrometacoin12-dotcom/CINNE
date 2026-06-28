import type { Config } from 'tailwindcss';
// Shared design-system preset (Netflix + Liquid Glass tokens).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('@cinnetemple/config/tailwind');

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
