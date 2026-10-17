import type { AuthedRequest, PlatformRequest, PlatformUser, SessionUser } from '../request.types';

/**
 * Test fixtures for the typed request. A spec builds only the session fields
 * the code under test reads; these state that the rest is deliberately absent,
 * in ONE place, instead of `as any` at every call.
 */
export function fakeUser(fields: Record<string, unknown>): SessionUser {
  return fields as unknown as SessionUser;
}

export function fakeReq(req: Record<string, unknown>): AuthedRequest {
  return req as unknown as AuthedRequest;
}

export function fakePlatformReq(req: Record<string, unknown>): PlatformRequest {
  return req as unknown as PlatformRequest;
}

export function fakePlatformUser(fields: Record<string, unknown>): PlatformUser {
  return fields as unknown as PlatformUser;
}
