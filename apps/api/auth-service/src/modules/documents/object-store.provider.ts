import { Provider } from '@nestjs/common';
import { ObjectStore, objectStoreConfigFromEnv } from '@hbcfield/shared/storage';

/**
 * The object store, as an injected dependency rather than a `new` inside the
 * service.
 *
 * Not ceremony. Constructing it internally made every path that touches storage
 * — hashing an upload, content-addressing a key, deleting a staging object —
 * reachable only with real credentials and a real bucket, so none of it could be
 * covered by a test. The behaviour that matters most here (that the server
 * hashes the bytes IT read, rather than trusting what a client claimed) was
 * exactly the part that could not be asserted.
 *
 * Resolves to `null` when no credentials are configured, which is how a
 * developer machine behaves: the service starts and says so plainly on the paths
 * that need it, rather than failing at boot.
 */
export const OBJECT_STORE = 'OBJECT_STORE';

export const objectStoreProvider: Provider = {
  provide: OBJECT_STORE,
  useFactory: (): ObjectStore | null => {
    const config = objectStoreConfigFromEnv();
    return config ? new ObjectStore(config) : null;
  },
};
