/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — the app is client-rendered (all pages 'use client'
  // and fetch in the browser), so it hosts as static files with no SSR runtime.
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: true,
  transpilePackages: ['@cinnetemple/shared'],
  images: { unoptimized: true },
};

export default nextConfig;
