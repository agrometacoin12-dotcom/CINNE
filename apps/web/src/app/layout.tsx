import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display, Readex_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-provider';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-serif',
  display: 'swap',
});
const readex = Readex_Pro({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
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
