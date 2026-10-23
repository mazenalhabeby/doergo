import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UPLOAD_RULES } from '@hbcfield/shared';
import { ObjectStore, extensionForMime } from '@hbcfield/shared/storage';

// What may be uploaded, and how big: ONE shared definition (constants/upload-rules.ts).
const MAX_FILE_SIZE = UPLOAD_RULES.worklog.maxBytes;

const ALLOWED_FILE_TYPES = UPLOAD_RULES.worklog.allTypes;

const BODY_MAX = 5000;

const BATCH_MAX = 200;

const UPLOAD_TTL_SECONDS = 3600;

type Session = { id: string; userId: string; organizationId: string; clockInAt: Date };

/** Every attachment for this session lives under this key prefix (confirm guard). */
function sessionPrefix(te: Session): string {
  const d = te.clockInAt ?? new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${te.organizationId}/attendance/${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${te.userId}/${te.id}/`;
}

/** The object key: {orgId}/attendance/{YYYY}/{MM}/{DD}/{userId}/{timeEntryId}/{uuid}.{ext} */
function objectKey(te: Session, mime: string): string {
  return `${sessionPrefix(te)}${randomUUID()}.${extensionForMime(mime)}`;
}

function cleanBody(body: unknown): string {
  const b = typeof body === 'string' ? body.trim() : '';
  if (!b) throw new BadRequestException('Note text is required');
  return b.slice(0, BODY_MAX);
}

function parseAt(at: unknown): Date {
  if (typeof at === 'string' || typeof at === 'number') {
    const d = new Date(at);
    // Reject garbage / far-future (>1 day ahead); fall back to now.
    if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 24 * 60 * 60 * 1000) return d;
  }
  return new Date();
}

/** Never fails the user's delete: an orphaned object costs a fraction of a cent. */
async function deleteStoredObject(store: ObjectStore | null, key: string, logger: Logger): Promise<void> {
  if (store && !(await store.delete(key))) {
    logger.warn(`Failed to delete stored object ${key}`);
  }
}

export { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, BODY_MAX, BATCH_MAX, UPLOAD_TTL_SECONDS, Session };
export { sessionPrefix, objectKey, cleanBody, parseAt, deleteStoredObject };
