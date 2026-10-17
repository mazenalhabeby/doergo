import { UPLOAD_RULES } from '@hbcfield/shared';

// What may be uploaded, and how big: ONE shared definition (constants/upload-rules.ts).
const MAX_FILE_SIZE = UPLOAD_RULES.worklog.maxBytes;

const ALLOWED_FILE_TYPES = UPLOAD_RULES.worklog.allTypes;

const BODY_MAX = 5000;

const BATCH_MAX = 200;

const UPLOAD_TTL_SECONDS = 3600;

type Session = { id: string; userId: string; organizationId: string; clockInAt: Date };

export { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, BODY_MAX, BATCH_MAX, UPLOAD_TTL_SECONDS, Session };
