import type { NextConfig } from 'next';

/*
  Content-Security-Policy — ENFORCING, and written from what the app actually
  loads (grep before you tighten it, or a screen breaks silently):

  - Scripts: our own bundles only. 'unsafe-inline' stays because Next.js
    App Router inlines its hydration/flight scripts and we do not render with
    per-request nonces (that would make every page dynamic). What this policy
    still buys against XSS: no script from ANY other origin, no <object>/<embed>,
    no <base> hijack, no framing by another site, no form posted elsewhere.
    'wasm-unsafe-eval' lets pdf.js compile its WebAssembly decoders; it does NOT
    allow JS eval. 'unsafe-eval' is added in development only (React refresh).
  - Styles: 'unsafe-inline' — Leaflet, Recharts and Radix set inline styles.
    Fonts come through next/font, which self-hosts them ('self').
  - Images: map tiles (MapTiler/OSM, configurable), Leaflet's marker icons on
    unpkg, avatars, and presigned S3 (Hetzner) URLs whose host varies per
    bucket — hence `https:`. data:/blob: for previews and generated images.
  - connect-src: the API and Socket.IO (same origin behind nginx; any https/wss
    origin when NEXT_PUBLIC_API_URL / SOCKET_URL point elsewhere), presigned S3
    uploads, and localhost in development.
  - frame-src blob:/https: — PDF previews render a blob: URL or a presigned
    document URL in an iframe;
    pdf.js runs its worker from our own bundle.
*/
const isDev = process.env.NODE_ENV !== 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:" + (isDev ? ' http://localhost:*' : ''),
  "font-src 'self' data:",
  "connect-src 'self' https: wss:" + (isDev ? ' http://localhost:* ws://localhost:*' : ''),
  "media-src 'self' blob: https:",
  "frame-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // A separate build directory can be requested with NEXT_DIST_DIR. `next dev`
  // and `next build` otherwise share `.next` and clobber each other, which
  // fails a build with "Cannot find module for page" that has nothing to do
  // with the code.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
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
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        /*
          The document register moved from /documents/sent to /documents/all —
          it holds every document in the organization, issued AND supplied, and
          half of it is a filing cabinet rather than an outbox.

          Here rather than as a page calling `redirect()`: that page prerenders,
          so the "redirect" arrives as a 200 with a JavaScript navigation inside
          it. This is a real 308 before any HTML is built — which is what a link
          somebody bookmarked, or a crawler, actually needs.
        */
        source: '/documents/sent',
        destination: '/documents/all',
        permanent: true,
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
