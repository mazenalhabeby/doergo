import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { from, Observable, of, throwError } from 'rxjs';
import { requestIdempotency } from '@hbcfield/shared';
import { catchError, mergeMap, tap } from 'rxjs/operators';
import { IdempotencyStore } from './idempotency.store';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Printable, bounded, and never a separator we use in the Redis key. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;
/** Answers larger than this are not remembered; a retry then runs again. */
const MAX_STORED_BYTES = 256 * 1024;

/**
 * The same request twice is the same request once.
 *
 * A phone that sends a clock-in, loses signal before the answer arrives and
 * sends it again must not clock in twice — and until now every write in the API
 * would have done exactly that (the gateway even answers 408 while a queued job
 * can still finish). Offline mode makes retries the normal case, so this is the
 * foundation it stands on.
 *
 * Opt-in per request with an `Idempotency-Key` header (draft-ietf-httpapi-
 * idempotency-key-header): no header, no change in behaviour.
 *
 *  - same key, same request, finished  → the stored answer, `Idempotent-Replayed: true`
 *  - same key, same request, running   → 409, retry later
 *  - same key, DIFFERENT request       → 422 — a key is never reused for another action
 *  - the request failed                → forgotten, so a retry runs again
 *
 * Keys are scoped to the authenticated member: one member cannot replay, or
 * probe for, another member's answer by guessing a key.
 *
 * ⚠️ Registered BEFORE the audit interceptor, so a replay never writes a second
 * audit entry for an action that happened once.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const header = req.headers?.['idempotency-key'];
    if (!header || !MUTATING.has(req.method)) return next.handle();

    const key = Array.isArray(header) ? header[0] : String(header);
    if (!KEY_SHAPE.test(key)) {
      return throwError(() => new BadRequestException('Idempotency-Key must be 16–128 letters, digits, "-" or "_"'));
    }
    const userId: string | undefined = req.user?.id;
    // Unauthenticated routes (sign-in, refresh) never take a key: their answers
    // carry credentials, and remembering those would be a token cache anyone
    // holding the key could read.
    if (!userId) return next.handle();

    const hash = requestHash(req.method, req.originalUrl ?? req.url, req.body);

    return from(this.store.claim(userId, key, hash)).pipe(
      mergeMap((result) => {
        if ('unavailable' in result) {
          this.logger.warn('Idempotency store unavailable — running without it');
          return next.handle();
        }
        if (!result.claimed) {
          const { entry } = result;
          if (entry.hash !== hash) {
            return throwError(() => new UnprocessableEntityException({
              message: 'This Idempotency-Key was already used for a different request',
              code: 'IDEMPOTENCY_KEY_REUSED',
            }));
          }
          if (entry.state === 'running') {
            return throwError(() => new ConflictException({
              message: 'The same request is still being processed — retry shortly',
              code: 'IDEMPOTENCY_IN_PROGRESS',
            }));
          }
          res.status(entry.status);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(entry.body);
        }

        // The key travels with the handler (AsyncLocalStorage) so a queued job
        // takes its id from it — see idempotency-context.ts.
        return new Observable<unknown>((subscriber) =>
          requestIdempotency.run({ key, userId }, () => next.handle().subscribe(subscriber)),
        ).pipe(
          tap((body) => {
            const status = res.statusCode ?? 200;
            const size = safeSize(body);
            if (size === null || size > MAX_STORED_BYTES) {
              void this.store.release(userId, key);
              return;
            }
            void this.store.complete(userId, key, { state: 'done', hash, status, body });
          }),
          catchError((err) => {
            void this.store.release(userId, key);
            return throwError(() => err);
          }),
        );
      }),
    );
  }
}

/** What makes two requests "the same": method, path and body — not headers or time. */
export function requestHash(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(method.toUpperCase())
    .update('\n')
    .update(url)
    .update('\n')
    .update(stableStringify(body ?? null))
    .digest('hex');
}

/** JSON with sorted keys, so `{a,b}` and `{b,a}` hash alike. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function safeSize(body: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(body ?? null));
  } catch {
    return null;
  }
}
