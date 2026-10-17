/** The client itself: envelope by shape, one refresh-and-retry, the retry policy, GET merge, cache hooks. */
import type { Endpoint, EndpointArgs, EndpointBody, EndpointResult } from '../define';
import { createClientContext } from './context';
import { createExchange } from './exchange';
import { createRequest } from './request';
import type { ApiClient, ApiClientConfig, CallArgs, CallOptions, RequestOptions } from './types';

// ── the client ────────────────────────────────────────────────────────────────

export function createApiClient(config: ApiClientConfig): ApiClient {
  const ctx = createClientContext(config);
  const inflight = new Map<string, Promise<unknown>>();
  const request = createRequest(ctx, createExchange(ctx), inflight);

  const client: ApiClient = {
    request: (method, p, opts) => request(method, p, opts),
    get: (p, opts) => request('GET', p, opts),
    post: (p, body, opts) => request('POST', p, { ...opts, body }),
    put: (p, body, opts) => request('PUT', p, { ...opts, body }),
    patch: (p, body, opts) => request('PATCH', p, { ...opts, body }),
    delete: (p, opts) => request('DELETE', p, opts),
    upload: (p, form, opts) =>
      request('POST', p, { ...opts, body: form, retry: opts?.retry ?? { networkRetries: 0 } }, ctx.uploadTimeoutMs),
    page: (p, opts) => request('GET', p, { ...opts, unwrap: 'page', dedupe: false, cache: false }),
    call: <D extends Endpoint<any, any, any>>(
      def: D,
      ...rest: CallArgs<EndpointArgs<D>, EndpointBody<D>>
    ): Promise<EndpointResult<D>> => {
      type R = EndpointResult<D>;
      const [args, opts] = rest as unknown as [EndpointArgs<D>, CallOptions<EndpointBody<D>> | undefined];
      let built: string;
      try {
        built = def.path(args);
      } catch (e) {
        return Promise.reject(e);
      }
      const keep = typeof def.keep === 'function' ? def.keep(args) : def.keep;
      const base: RequestOptions = { ...(opts ?? {}) };
      if (keep !== undefined) base.keep = keep;
      if (def.public) base.auth = false;
      if (def.upload) return client.upload<R>(built, opts?.body, base);
      return request<R>(def.method, built, base);
    },
    clearInflight: () => inflight.clear(),
  };
  return client;
}
