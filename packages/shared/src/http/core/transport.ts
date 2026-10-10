/**
 * The few platform types the HTTP core touches, declared STRUCTURALLY.
 *
 * `packages/shared` compiles against ES2022 with no DOM library, and its
 * declarations are read by a browser app, a React Native app and Node services.
 * Naming `Response` or `AbortSignal` here would tie the published types to one
 * of those environments. These shapes are what every real `fetch` already
 * satisfies — the browser's, React Native's and Node's — so each app passes its
 * own `fetch` without a cast.
 */

/** The parts of `AbortSignal` the core reads. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** The parts of `Headers` the core reads. */
export interface HeadersLike {
  get(name: string): string | null;
  forEach?(callback: (value: string, name: string) => void): void;
}

/** The parts of `Response` the core reads. The body is read ONCE, as text. */
export interface ResponseLike {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: HeadersLike;
  text(): Promise<string>;
}

/** What the core hands to `fetch`. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignalLike;
  credentials?: 'include' | 'omit' | 'same-origin';
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached';
}

/**
 * `fetch`, as the core calls it. `init` is typed loosely on purpose: the
 * platform's own `RequestInit` (DOM, undici, React Native) differs in details
 * the core never touches, and a strict type here would make every app cast.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FetchLike = (url: string, init?: any) => Promise<ResponseLike>;

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A value a query string may carry. Arrays are joined with commas. */
export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;
export type QueryParams = { readonly [key: string]: QueryValue };
