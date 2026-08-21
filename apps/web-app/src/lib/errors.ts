/**
 * Reading a message off something that was thrown.
 *
 * `catch` gives you `unknown`, because anything can be thrown — a string, a
 * number, an object from a library that never heard of Error. Twelve screens
 * wrote `catch (e: any)` and reached straight for `e.message`, which works
 * until the day something throws that has no message and the toast reads
 * "undefined".
 *
 * One helper instead: it narrows properly, and every caller gets to name the
 * fallback the user should see when the thrown thing tells us nothing.
 */
export function errorMessage(thrown: unknown, fallback = ''): string {
  if (thrown instanceof Error && thrown.message) return thrown.message
  // Some APIs reject with a plain object carrying a message.
  if (typeof thrown === 'object' && thrown !== null && 'message' in thrown) {
    const m = (thrown as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  if (typeof thrown === 'string' && thrown) return thrown
  return fallback
}
