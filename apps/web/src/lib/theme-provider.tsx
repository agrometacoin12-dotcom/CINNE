'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

/** Dark-first theme provider (dark/light via the `class` strategy). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </NextThemeProvider>
  );
}
