import { Global, Module, Provider, ServiceUnavailableException } from '@nestjs/common';
import { ObjectStore, objectStoreConfigFromEnv } from './object-store';

/**
 * The injection token for the one object store.
 *
 * Every service that touches the bucket asks for this instead of building its
 * own S3 client. There were eight, each re-reading the same five environment
 * variables with slightly different defaults (one used region `eu-central-1`,
 * the rest `eu-central`) — which is how a provider move becomes eight edits and
 * a missed one.
 */
export const OBJECT_STORE = 'OBJECT_STORE';

/**
 * Resolves to `null` when no credentials are configured — a developer machine
 * without keys still boots, and the paths that need storage say so plainly via
 * `requireObjectStore`.
 */
export const objectStoreProvider: Provider = {
  provide: OBJECT_STORE,
  useFactory: (): ObjectStore | null => {
    const config = objectStoreConfigFromEnv();
    return config ? new ObjectStore(config) : null;
  },
};

/** Import once in a service's root module; every provider can then inject OBJECT_STORE. */
@Global()
@Module({
  providers: [objectStoreProvider],
  exports: [objectStoreProvider],
})
export class ObjectStoreModule {}

/**
 * The store, or a 503 that names the problem.
 *
 * A missing store is configuration, not a bug in the request — the caller gets
 * "storage is not configured" instead of an S3 SDK error about an empty
 * endpoint.
 */
export function requireObjectStore(store: ObjectStore | null): ObjectStore {
  if (!store) throw new ServiceUnavailableException('File storage is not configured');
  return store;
}
