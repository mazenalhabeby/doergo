import i18n from 'i18next';

/**
 * What a member reads when the phone could not reach the server.
 *
 * Said HERE, in the member's language, rather than at the ~200 places that
 * render `err.message`. The old text — "Request timed out. Please check your
 * connection." — was hard-coded English, so a German phone showed an English
 * sentence next to a German button, and it blamed the member's connection in
 * the language of a developer. One sentence changed here changes all of them.
 *
 * ⚠️ i18next is read as the singleton the app initialises (`src/i18n`), NOT by
 * importing that module: this file is reached by the background sync task,
 * which has no React tree and never initialises it. There, and only there, the
 * English fallback below is what comes out — and nobody is looking at it.
 */
const FALLBACK: Record<Kind, string> = {
  offline: "You're offline. This will load when you're back online.",
  slow: 'The connection is too weak to load this. It will work again when the signal is better.',
};

export type Kind =
  /** Nothing answered — no signal, airplane mode, the server unreachable. */
  | 'offline'
  /** Something is there but too slow: the request ran out of time. */
  | 'slow';

export function networkErrorText(kind: Kind): string {
  const key = `offline.network.${kind}`;
  try {
    if (!i18n.isInitialized) return FALLBACK[kind];
    const text = i18n.t(key);
    // i18next hands the key back when it has no translation for it.
    return typeof text === 'string' && text !== key ? text : FALLBACK[kind];
  } catch {
    return FALLBACK[kind];
  }
}
