import type { NextConfig } from 'next';

/**
 * Content-Security-Policy for the operator console.
 *
 * The console holds a token that reaches every customer's data, so the page may
 * load script only from itself and talk only to the API it was built against.
 *   - script-src keeps 'unsafe-inline': Next's App Router inlines its bootstrap
 *     and flight data and this app does not use nonces. Dev adds 'unsafe-eval'
 *     (React Refresh); production does not.
 *   - connect-src: 'self' (the same-origin /api/v1 and /socket.io in production,
 *     which 'self' also covers for ws:/wss:) plus, when NEXT_PUBLIC_API_URL is an
 *     absolute URL (local dev: http://localhost:4000/api/v1), that origin and its
 *     websocket twin — the support inbox opens a Socket.IO connection there —
 *     and likewise NEXT_PUBLIC_SOCKET_URL (local dev: the socket server's port).
 *   - img-src data: blob: for the 2FA QR code (a data: URL).
 */
function apiOrigins(raw: string | undefined): string[] {
  if (!raw || raw.startsWith('/')) return [];
  try {
    const u = new URL(raw);
    return [u.origin, `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`];
  } catch {
    return [];
  }
}

const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${[...new Set(["'self'", ...apiOrigins(process.env.NEXT_PUBLIC_API_URL), ...apiOrigins(process.env.NEXT_PUBLIC_SOCKET_URL)])].join(' ')}`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  // The shared HTTP core and endpoint table (@hbcfield/shared/client) — the
  // same way the web app takes it.
  transpilePackages: ['@hbcfield/shared'],
  // Internal operator console — never indexed, hardened headers.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
