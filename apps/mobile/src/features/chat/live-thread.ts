/**
 * A NEW MESSAGE IS ADDED, NOT RELOADED — the phone's side of the rules.
 *
 * ⚠️ Every message that arrived on the socket cost three requests and a
 * redraw of everything: the conversation list, the WHOLE history of the open
 * thread, and a mark-read — for a payload that already carried the message.
 * The socket's message is now put where it belongs; the list's row moves to
 * the top with it; the read mark waits a second so a burst is one request.
 * Only when the payload cannot be placed (no message, a conversation this
 * phone has never listed) does a reload happen — debounced, once per burst.
 *
 * Plain TypeScript (no React Native) so it is unit-tested.
 */
// The placement rules are shared with the web (`@hbcfield/shared` chat/live.ts).
export { isPlaceable, appendMessage, applyToConversations, markReadLocally } from '@hbcfield/shared/client';

/**
 * Call `fn` once, `ms` after the LAST call — a burst of socket events is one
 * request. `flush` runs a pending call now; `cancel` drops it (unmount).
 */
export function debounce(fn: () => void, ms: number, timers: {
  set: (f: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
} = {
  set: (f, t) => setTimeout(f, t),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}) {
  let id: unknown = null;
  const run = () => { id = null; fn(); };
  return {
    call() { if (id !== null) timers.clear(id); id = timers.set(run, ms); },
    flush() { if (id !== null) { timers.clear(id); run(); } },
    cancel() { if (id !== null) timers.clear(id); id = null; },
    pending: () => id !== null,
  };
}

/** The bubble's shape, from its neighbours — one rule with the web, in shared. */
export { bubbleShape } from '@hbcfield/shared/client';
