import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server output that bundles `next` + traced runtime deps,
  // so the pnpm-monorepo symlink layout works on Amplify's SSR runtime.
  output: 'standalone',
  // Trace from the monorepo root so workspace dependencies are included
  // (under `experimental` for Next.js 14.x).
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow importing the shared workspace package (TS source).
  transpilePackages: ['@cinnetemple/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
