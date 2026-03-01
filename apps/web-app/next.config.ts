import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@doergo/shared'],
  output: 'standalone',
};

export default nextConfig;
