/**
 * Turn raw Prisma / internal errors into clean, user-safe messages.
 *
 * The frontends display a failed request's `message` verbatim in a toast. Without
 * this, an unguarded Prisma throw dumps developer text like
 *   Invalid `prisma.statusWorkflow.create()` invocation: Unique constraint failed
 *   on the fields: (`organizationId`,`name`)
 * straight into the UI. These helpers are wired into the two shared forwarders
 * (BullMQ base-queue + RPC exception filter) so no raw Prisma text can ever reach
 * a toast — a systemic safety net beneath the per-endpoint guards (which still
 * provide the nicer, specific messages like "A task type named X already exists").
 *
 * Messages are English (backend has no i18n); the frontend shows them as-is.
 */

// Detects text that is clearly a raw Prisma/engine error rather than an
// intentional, human-written message.
const PRISMA_DUMP =
  /invalid `?prisma\.|prisma\.[a-z_]+\.[a-z_]+\(\)|unique constraint failed|foreign key constraint|record to (update|delete)|inconsistent (column|query) data|argument .+ is missing|violates .+ constraint|prismaclient/i;

/** Clean message + HTTP status for a known Prisma error code. */
function messageForCode(code: string): { status: number; message: string } | null {
  switch (code) {
    case 'P2002':
      return { status: 409, message: 'That name or value is already in use.' };
    case 'P2025':
      return { status: 404, message: 'That item no longer exists — it may have been removed.' };
    case 'P2003':
    case 'P2014':
      return { status: 409, message: 'This can’t be done because the item is still linked to other records.' };
    case 'P2000':
      return { status: 400, message: 'One of the values is too long.' };
    case 'P2011':
      return { status: 400, message: 'A required value is missing.' };
    default:
      return null;
  }
}

/**
 * Map a thrown exception object to a clean `{status, message}` when it is a raw
 * Prisma error; returns `null` for anything else (leave it untouched). Uses
 * duck-typing so `@hbcfield/shared` needn't depend on `@prisma/client`.
 */
export function mapPrismaException(exception: unknown): { status: number; message: string } | null {
  const e = exception as { name?: string; code?: unknown; clientVersion?: unknown; message?: string };
  if (!e || typeof e !== 'object') return null;
  const looksPrisma =
    (typeof e.name === 'string' && e.name.startsWith('PrismaClient')) ||
    (typeof e.code === 'string' && /^P\d{4}$/.test(e.code) && e.clientVersion != null);
  if (!looksPrisma) return null;
  if (typeof e.code === 'string') {
    const mapped = messageForCode(e.code);
    if (mapped) return mapped;
  }
  return { status: 500, message: 'Something went wrong on our side. Please try again.' };
}

/**
 * String-only sanitizer (for the BullMQ path, where only the serialized error
 * message survives). If the text is a raw Prisma dump, returns a clean
 * `{status, message}`; otherwise returns the original message with `fallbackStatus`
 * (so intentional messages like a ConflictException's text pass through unchanged).
 */
export function sanitizeErrorMessage(
  message: string | undefined | null,
  fallbackStatus = 500,
): { status: number; message: string } {
  const raw = (message ?? '').trim();
  if (!raw) return { status: fallbackStatus, message: 'Something went wrong. Please try again.' };
  if (/unique constraint failed/i.test(raw)) return { status: 409, message: 'That name or value is already in use.' };
  if (/record to (update|delete)/i.test(raw)) return { status: 404, message: 'That item no longer exists — it may have been removed.' };
  if (/foreign key constraint/i.test(raw)) return { status: 409, message: 'This can’t be done because the item is still linked to other records.' };
  if (PRISMA_DUMP.test(raw)) return { status: 500, message: 'Something went wrong. Please try again.' };
  return { status: fallbackStatus, message: raw };
}
