/**
 * The one object store.
 *
 * Five places in this codebase build an S3 client: the gateway's StorageService
 * and the task service's worklog, attachments, shift-issues and reports
 * services. Each repeats the same endpoint/credential/path-style setup, and
 * each has drifted slightly from the others. This is the replacement.
 *
 * New code uses it. The four existing call sites are migrated afterwards, one
 * per change — reshaping an abstraction while a feature is still shaping it is
 * how a refactor takes a working system down with it.
 *
 * ── Two rules this class exists to enforce ──────────────────────────────────
 *
 * 1. BYTES NEVER PASS THROUGH THE API. Uploads and downloads are both presigned
 *    and go straight to object storage. A 40 MB PDF must never occupy a Node
 *    event loop that is also serving the dispatch board.
 *
 * 2. KEYS ARE CONTENT-ADDRESSED. `documentKey()` derives the key from the
 *    SHA-256 of the bytes, so identical files are stored once, the key cannot
 *    collide, and the key IS the integrity check — there is no separate hash to
 *    keep in sync with the object.
 */
export {
  type ObjectStoreConfig,
  type PresignedUpload,
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  MEDIA_URL_TTL_SECONDS,
  extensionForMime,
  type ObjectKind,
  newObjectKey,
  keyFromStoredUrl,
  sha256,
  documentKey,
  signatureKey,
  objectStoreConfigFromEnv,
  contentDisposition,
} from './object-store/keys';
export { ObjectStore } from './object-store/store';
