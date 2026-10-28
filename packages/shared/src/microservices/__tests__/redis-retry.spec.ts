import { createClientOptions, createMicroserviceOptions, REDIS_TRANSPORT_RETRY } from '../redis.config';

/**
 * Both directions of the Redis transport keep reconnecting. Without `retryAttempts` Nest never re-establishes a
 * dropped connection, and a gateway that lost its link answered 500 to every request while looking healthy.
 */
describe('the Redis transport reconnects', () => {
  const config = { get: (k: string) => ({ REDIS_HOST: 'redis', REDIS_PORT: '6379' })[k] };

  it("every service's listener", () => {
    const o = createMicroserviceOptions(config as any) as any;
    expect(o.options.retryAttempts).toBe(REDIS_TRANSPORT_RETRY.retryAttempts);
    expect(o.options.retryDelay).toBeGreaterThan(0);
  });

  it("the gateway's clients", () => {
    const o = (createClientOptions('AUTH_SERVICE' as any).useFactory as any)(config) as any;
    expect(o.options.retryAttempts).toBe(REDIS_TRANSPORT_RETRY.retryAttempts);
    expect(o.options.host).toBe('redis');
  });
});
