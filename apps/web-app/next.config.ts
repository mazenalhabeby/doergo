import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hbcfield/shared'],
  output: 'standalone',
};

export default nextConfig;
