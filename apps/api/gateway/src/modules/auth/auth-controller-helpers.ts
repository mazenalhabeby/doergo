import { Request, Response } from 'express';

const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** The httpOnly refresh cookie — one definition for sign-in and rotation. */
function setRefreshCookie(res: Response, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

/**
 * Is this request from the web app?
 *
 * The web names itself two ways: `client: 'web'` in the sign-in body (it picks
 * the session length) and `X-Client-Platform: web` on every other request. The
 * phone sends `mobile` or — older builds — nothing at all, and must keep
 * receiving the refresh token in the body: it has no cookie jar and keeps the
 * token in SecureStore. So the default is "not a browser".
 */
export function isBrowserClient(req: Request, body?: { client?: string } | null): boolean {
  const header = String(req.headers['x-client-platform'] ?? '').toLowerCase().trim();
  return header === 'web' || String(body?.client ?? '').toLowerCase().trim() === 'web';
}

/**
 * Take the refresh token out of a JSON answer meant for a browser.
 *
 * The browser already holds it in the httpOnly cookie set beside this answer
 * — the one place script cannot read it. Putting the same token in the body as
 * well handed it to any script running on the page, which is exactly the XSS
 * the cookie exists to defeat: a durable credential, readable for 30 days.
 */
export function withoutRefreshTokenForBrowser<T extends { data?: any } | null | undefined>(result: T, browser: boolean): T {
  if (!browser || !result?.data || !('refreshToken' in result.data)) return result;
  const { refreshToken: _omit, ...data } = result.data;
  return { ...result, data } as T;
}

export { REFRESH_COOKIE_MAX_AGE_MS, setRefreshCookie };
