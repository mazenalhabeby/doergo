import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hbcfield/shared'],
  eslint: {
    // The web app had NO eslint config until now, so lint never ran and ~250
    // pre-existing violations accumulated (mostly no-explicit-any / unused
    // vars / exhaustive-deps). Lint is available as `pnpm lint` and should be
    // worked down; blocking `next build` on that backlog today would only stop
    // deploys. Flip this off once the backlog is cleared.
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  poweredByHeader: false,
  images: {
    // Serve modern formats — smaller LCP/payload for the marketing screenshots.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4000' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      { protocol: 'https', hostname: 'randomuser.me' },
    ],
  },
  // Barrel-optimise big icon/util libs → smaller client JS across the app.
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@radix-ui/react-icons'],
  },
  // Security headers (also a minor ranking/trust signal). HSTS + hardening.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
  async rewrites() {
    // In production nginx proxies /api and /uploads to the gateway BEFORE the
    // request reaches Next, so these rewrites are a dev/self-host convenience.
    // Never hardcode localhost into the standalone build: honour an override so a
    // misconfigured deploy can't route authenticated API traffic (with the auth
    // cookie) to whatever is on :4000 of the app container. (Sec audit H10.)
    const apiOrigin = process.env.API_PROXY_ORIGIN || 'http://localhost:4000';
    return [
      {
        source: '/uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
