import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A sentence as DATA — a translation key and its values.
 *
 * The home cards decide WHAT to say in pure, tested files (action-strip-state,
 * clients-state) and never hold a sentence; the component turns the phrase
 * into words. One type and one translator for all of them.
 */
export interface Phrase { key: string; values?: Record<string, string | number> }

export function usePhrase(): (p: Phrase) => string {
  const { t } = useTranslation();
  return useCallback((p: Phrase) => t(p.key, { ...(p.values ?? {}) } as Record<string, unknown>) as string, [t]);
}
