# `@hbcfield/shared` — the HTTP core

One request pipeline and one endpoint table for the web app, the phone and the
admin console. Browser / React Native / Node safe: no Node APIs, no DOM types
(`core/transport.ts` declares the few platform shapes structurally).

```
core/envelope.ts      unwrap BY SHAPE ({success,data,meta} → data; {success,data:null} → null; {data,hasMore} → data; 204 → null)
core/api-error.ts     ApiError { status, kind: http|network|timeout|aborted|parse, code?, params?, retryable } + toApiError(body, status)
core/path.ts          path`/tasks/${id}` (every value encodeURIComponent'd) + withQuery(path, params)
core/create-client.ts createApiClient(config) → { request, get, post, put, patch, delete, upload, page, call, clearInflight }
core/define.ts        endpoint<Args, Res, Body>({ method, path, keep?, public?, upload? }) + defineEndpoints(domain, {...})
core/query-keys.ts    queryKey(def | 'domain.key', args) — derived, deterministic; domainKey('tasks') to invalidate a domain
core/result.ts        toResult(promise) → { status, data, error, errorCode, errorParams } — the web's non-throwing shape
types.ts              answer shapes both apps declared (CrewView, JobTimeView, OrgMember, CalendarEventDetail…)
endpoints/*.ts        the table, by domain; `apiEndpoints` is the registry
endpoints/platform-admin.ts  the operator console's `/platform/*` routes — its OWN registry, `platformEndpoints`
```

## How an app plugs in

```ts
export const api = createApiClient({
  baseUrl: () => API_BASE_URL,
  getToken: () => token,                          // may be async (SecureStore)
  refresh: async () => 'refreshed' | 'invalid' | 'unreachable', // the core makes it single-flight
  onSessionEnded: (reason, err) => signOut(),     // only after the SERVER refused
  headers: () => ({ 'X-Client-Platform': 'web' }),
  // optional: timeoutMs, retry, dedupeGets + sessionKey, cache, observe, credentials, messages
});

const task = await api.call(apiEndpoints.tasks.get, { id });
await api.call(apiEndpoints.tasks.setStatus, { id }, { body: { status: 'ARRIVED', lat, lng } });
useQuery({ queryKey: queryKey(apiEndpoints.tasks.get, { id }), queryFn: () => api.call(apiEndpoints.tasks.get, { id }) });
```

Behaviour every app gets: one 401 → refresh → retry (only `invalid` ends the
session); 429 retried for any method honouring `Retry-After`; 502/503/504 and
one network blip retried for GET/HEAD only; per-attempt timeout that follows
the caller's `signal`; transport failures as `ApiError` with status 0.

- **Web**: `credentials: 'include'`, `refresh` wraps `auth-session.refreshAccessToken()`
  (`ok`→`refreshed`, `ended`→`invalid`, `unavailable`→`unreachable`), `retry: { maxRetries: 4 }`.
  `toResult(api.get(p, { unwrap: 'raw' }))` is exactly today's `api.get` — migrate a domain at a time.
- **Phone**: SecureStore `getToken`, `refreshSession()` mapped, `timeoutMs: 15000`, `dedupeGets: true` +
  `sessionKey: () => knownOwner`, `cache` → response-cache.ts (`req.keep ?? isKeptResponse(req.path)`),
  `observe` → connectivity + server clock, `messages` → `networkErrorText`. `ApiError.statusCode` still works.
- **Console** (`apps/admin/lib/api/client.ts`): no `refresh` (a 401 calls `onSessionEnded('unauthorized')`;
  the console slides its token itself), `fetchCache: 'no-store'`, `credentials: 'omit'`, `timeoutMs: 20000`,
  `observe.error` for `PLATFORM_2FA_ENROLMENT_REQUIRED`. Calls go through `platformEndpoints` (an operator
  token reaches every customer, so its routes stay out of the member apps' `apiEndpoints`); the cursor lists
  (`orgs.list`, `audit.list`) are called with `unwrap: 'raw'` to keep `nextCursor`.

## Adding an endpoint

1. Find its domain in `endpoints/` (or add a file + a line in `endpoints/index.ts` for a new domain —
   web-only and admin-only domains follow the same pattern).
2. `name: endpoint<Args, Res, Body>({ method, path: (a) => path`/x/${a.id}`, keep })` — route params through
   `path`, query values through `withQuery`. Check the route exists on the gateway controller.
3. Reuse a type that already lives in this package; add one to `types.ts` only when both apps need it.
4. `keep: true` only for a GET whose answer is the member's own data and harmless to hold offline; never
   for presence, signed links, billing or sync.

`apps/web-app/src/lib/__tests__/shared-http-endpoints.spec.ts` calls every path builder with hostile
values and fails on one that leaks a raw `/`, `?` or `#`.

## Rules

- **Never `fetch` outside the client** — except PUT/GET to a presigned S3 URL (an upload or a download
  link the API minted). The client refuses absolute URLs, so a token can only go to the API.
- **Never type a path or a query key by hand**: `apiEndpoints.*` and `queryKey(...)`.
- The core never logs. Errors carry no body, no token and no query string.
