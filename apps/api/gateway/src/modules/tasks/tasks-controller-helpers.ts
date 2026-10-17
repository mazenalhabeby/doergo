/**
 * Normalize query parameters to handle HTTP parameter pollution.
 * When multiple values are sent for the same parameter (e.g., ?status=NEW&status=COMPLETED),
 * NestJS creates an array. This function takes the first value to prevent errors.
 */
export function normalizeQueryParams(query: Record<string, any>): Record<string, string> {
  /*
    A query string only ever means strings. Express's parser also builds
    OBJECTS from brackets — `?customerId[not]=x` arrives as { not: 'x' } — and
    this whole object is spread into the task-service, where several filters go
    straight into a Prisma where, in which an object is an OPERATOR. So: the
    first value of a repeated param, and anything that is not a string dropped.
  */
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') normalized[key] = first;
  }
  return normalized;
}
