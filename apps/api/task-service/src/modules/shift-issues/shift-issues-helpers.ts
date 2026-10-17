import { UPLOAD_RULES } from '@hbcfield/shared';

// What may be uploaded, and how big: ONE shared definition (constants/upload-rules.ts).
// Shift-issue evidence takes no Word files — deliberate, and named there.
const MAX_FILE_SIZE = UPLOAD_RULES.shiftIssue.maxBytes;

const ALLOWED_FILE_TYPES = UPLOAD_RULES.shiftIssue.allTypes;

const UPLOAD_TTL_SECONDS = 3600;

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const BODY_MAX = 5000;

type Attachment = { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number | null; height?: number | null };

export { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, UPLOAD_TTL_SECONDS, SEVERITIES, BODY_MAX, Attachment };
