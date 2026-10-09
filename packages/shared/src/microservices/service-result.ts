import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A service's `{ success: false, … }` answer, as the HTTP error it is.
 *
 * Several services answer a refusal with a value rather than by throwing:
 * `{ success: false, statusCode, message, code?, params? }`. Every gateway
 * controller used to turn that into an HttpException by hand — about sixty
 * copies, which had drifted: some defaulted to 400 and some to 500, one
 * returned `result.data` and the rest the whole reply, and only one kept the
 * refusal's `code`, so the phone could not translate any of the others.
 *
 * ⚠️ `code` and `params` always travel: they are what the clients translate.
 * The default status is the caller's to choose, because a refusal with no
 * status meant different things in different modules and changing it silently
 * would change what a client sees.
 */
export interface ServiceRefusal {
  success: false;
  statusCode?: number;
  message?: string | string[];
  code?: string;
  params?: Record<string, unknown>;
}

export function isServiceRefusal(result: unknown): result is ServiceRefusal {
  return !!result && typeof result === 'object' && (result as { success?: unknown }).success === false;
}

/** Throw when the service refused; otherwise hand the result back untouched. */
export function assertServiceOk<T>(result: T, defaultStatus: number = HttpStatus.BAD_REQUEST): T {
  if (!isServiceRefusal(result)) return result;
  const { statusCode, message, code, params } = result;
  throw new HttpException(
    { message, ...(code ? { code } : {}), ...(params ? { params } : {}) },
    statusCode || defaultStatus,
  );
}

/** The same, for replies whose payload sits under `data`. */
export function unwrapServiceResult<T = unknown>(result: unknown, defaultStatus: number = HttpStatus.BAD_REQUEST): T {
  const ok = assertServiceOk(result, defaultStatus) as { data?: T } | T;
  return ((ok as { data?: T })?.data ?? ok) as T;
}
