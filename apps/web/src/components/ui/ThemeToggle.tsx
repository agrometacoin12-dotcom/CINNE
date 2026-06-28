'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/** Dark/light toggle with an accessible label. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = theme !== 'light';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="glass flex h-10 w-10 items-center justify-center rounded-full text-base transition hover:brightness-125"
    >
      {mounted ? (isDark ? '☀️' : '🌙') : '○'}
    </button>
  );
}
