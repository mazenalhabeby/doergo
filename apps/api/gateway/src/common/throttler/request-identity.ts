import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@hbcfield/shared';

/**
 * Who a request is, for rate limiting — the one rule both throttler guards read.
 */

/** Does the request carry a bearer token at all? (Not whether it is valid.) */
export function hasBearerToken(req: Record<string, any> | undefined): boolean {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string') return false;
  const [type, token] = header.split(' ');
  return type === 'Bearer' && !!token;
}

/** Is the route `@Public()` (on the handler or its controller)? */
export function isPublicRoute(context: ExecutionContext, reflector: Reflector): boolean {
  return !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}

/**
 * A signed-in member's request: a non-public route reached with a bearer token.
 *
 * Every other request — no token, or a `@Public()` route (login, refresh, the
 * password and invitation flows, the signing link, the operator sign-in), even
 * one that happens to carry a token — is ANONYMOUS and keeps the strict per-IP
 * limits.
 */
export function isMemberRequest(context: ExecutionContext, reflector: Reflector): boolean {
  if (context.getType() !== 'http') return false;
  if (isPublicRoute(context, reflector)) return false;
  return hasBearerToken(context.switchToHttp().getRequest());
}

/**
 * The client's IP. `req.ip` is Express's reading of `X-Forwarded-For` under
 * `trust proxy` (main.ts), which nginx fills from Cloudflare's CF-Connecting-IP
 * via `real_ip_header` — never the socket's peer, which is the proxy for everyone.
 */
export function ipTracker(req: Record<string, any>): string {
  return `ip:${req?.ip ?? req?.socket?.remoteAddress ?? 'unknown'}`;
}

/** The validated user's id, set on the request by `JwtAuthGuard`; null before it. */
export function memberIdOf(req: Record<string, any> | undefined): string | null {
  const id = req?.user?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function userTracker(userId: string): string {
  return `user:${userId}`;
}
