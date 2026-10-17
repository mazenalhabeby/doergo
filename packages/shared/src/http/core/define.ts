import type { HttpMethod } from './transport';

/**
 * An endpoint, defined ONCE and used by every app.
 *
 *   export const tasksEndpoints = defineEndpoints('tasks', {
 *     get: endpoint<{ id: string }, Task>({ method: 'GET', path: (a) => path`/tasks/${a.id}` }),
 *   });
 *
 *   const task = await client.call(tasksEndpoints.get, { id });
 *   useQuery({ queryKey: queryKey(tasksEndpoints.get, { id }), … });
 *
 * `A` — the arguments the PATH is built from (route params and query values);
 * `R` — what the call resolves with (after the envelope is unwrapped);
 * `B` — the request body, passed as `client.call(def, args, { body })`.
 *
 * ⚠️ Every route param goes through the `path` tag and every query value
 * through `withQuery` — `endpoint-paths.spec` calls every builder with hostile
 * values and fails on one that leaks a raw `/`, `?` or `#`.
 */
export interface EndpointConfig<A> {
  method: HttpMethod;
  path: (args: A) => string;
  /**
   * The phone may keep this GET's answer for offline reading (its response
   * cache's allow-list). A function decides per call — a live presence view of
   * the same route is never kept.
   */
  keep?: boolean | ((args: A) => boolean);
  /** Called without a session (sign-in, invitation lookup). No token, no refresh. */
  public?: boolean;
  /** A multipart upload: the body is FormData, sent as it is. */
  upload?: boolean;
}

export interface Endpoint<A = void, R = unknown, B = undefined> extends EndpointConfig<A> {
  /** `domain.key`, stamped by `defineEndpoints`. Query keys are derived from it. */
  readonly name: string;
  /** Type carrier only — never set at runtime. */
  readonly __types?: { args: A; res: R; body: B };
}

/**
 * Any endpoint, whatever it takes and answers — the constraint for helpers that only need its name
 * and settings. `Endpoint<A, …>` is invariant in A (A is both read and passed in), so no single
 * `Endpoint<X, …>` fits them all; this shape does: `path` taking `never` accepts every args type.
 */
export interface AnyEndpoint extends EndpointConfig<never> {
  readonly name: string;
  readonly __types?: { args: unknown; res: unknown; body: unknown };
}

export function endpoint<A = void, R = unknown, B = undefined>(config: EndpointConfig<A>): Endpoint<A, R, B> {
  return { ...config, name: '' };
}

/** Name every endpoint of a domain `domain.key`, so each has a stable identity. */
export function defineEndpoints<T extends Record<string, AnyEndpoint>>(domain: string, defs: T): T {
  for (const [key, def] of Object.entries(defs)) {
    if (def.name && def.name !== `${domain}.${key}`) {
      throw new Error(`endpoint ${def.name} is defined twice (again as ${domain}.${key})`);
    }
    Object.defineProperty(def, 'name', {
      value: `${domain}.${key}`,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return defs;
}

/** The path an endpoint builds for these arguments — for code that must hand a path to something else (a prefetch, a link). */
export function endpointPath<A>(def: Endpoint<A, unknown, unknown>, args: A): string {
  return def.path(args);
}

/** Argument / result / body types of a defined endpoint. */
export type EndpointArgs<D> = D extends Endpoint<infer A, infer _R, infer _B> ? A : never;
export type EndpointResult<D> = D extends Endpoint<infer _A, infer R, infer _B> ? R : never;
export type EndpointBody<D> = D extends Endpoint<infer _A, infer _R, infer B> ? B : never;
