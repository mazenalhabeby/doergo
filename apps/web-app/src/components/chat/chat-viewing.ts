/**
 * The conversation on screen right now (the Messages page sets it). Read inside
 * socket callbacks — a toast is not shown for it, its unread stays 0 — so it is
 * a plain module value, not React state.
 */
export const chatViewing = { id: null as string | null }
