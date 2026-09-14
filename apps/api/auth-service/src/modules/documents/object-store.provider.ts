/**
 * The object store, as an injected dependency rather than a `new` inside the
 * service — so hashing, content-addressing and staging cleanup can all be
 * covered by tests with a fake store.
 *
 * The token and provider now live in `@hbcfield/shared/storage`, shared with
 * the task service and the gateway. Re-exported here so this module's imports
 * and its tests keep one stable path.
 */
export { OBJECT_STORE, objectStoreProvider } from '@hbcfield/shared/storage';
