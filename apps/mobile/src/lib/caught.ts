/**
 * What a caught value says, read without assuming its type.
 *
 * A `catch` receives `unknown`: usually the shared client's ApiError (a message and a
 * `statusCode`), sometimes a plain Error, in principle anything. This reads the two
 * facts screens use — the message for a toast, the status to stay quiet on a 401 —
 * and gives nothing for a value that has neither, exactly as `e?.message` did.
 */
export function caught(e: unknown): { message?: string; statusCode?: number } {
  if (!e || typeof e !== 'object') return {};
  const { message, statusCode } = e as { message?: unknown; statusCode?: unknown };
  return {
    message: typeof message === 'string' ? message : undefined,
    statusCode: typeof statusCode === 'number' ? statusCode : undefined,
  };
}
