'use client';

import { AppShell } from './AppShell';

/**
 * Thin alias over AppShell so every in-app page renders the exact Figma shell:
 * 274px sidebar on desktop (Home frame 42:12534), floating liquid-glass bottom
 * tab pill on mobile. Kept for backwards compatibility with existing pages.
 */
export function MobileShell({ children }: { children: React.ReactNode; showTopBar?: boolean }) {
  return <AppShell>{children}</AppShell>;
}
