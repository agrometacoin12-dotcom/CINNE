import type { Metadata, Viewport } from 'next';
import { Inter, Baloo_2, Manrope } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-provider';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// Figma wordmark font — Baloo 2 (mapped to --font-serif variable slot).
const playfair = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-serif',
  display: 'swap',
});
// Figma display font — Manrope (mapped to the existing --font-readex variable
// so all `font-readex` usages render Manrope with no churn).
const readex = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-readex',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cinnetemple.com'),
  title: {
    default: 'CinneTemple — Your cinema, reimagined',
    template: '%s · CinneTemple',
  },
  description:
    'CinneTemple is a premium, cinematic streaming experience. Discover, save, and watch — beautifully.',
  applicationName: 'CinneTemple',
  openGraph: {
    title: 'CinneTemple',
    description: 'Your cinema, reimagined.',
    type: 'website',
    siteName: 'CinneTemple',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} ${readex.variable}`}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
