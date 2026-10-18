import type { SupportedLocale } from '../../../notifications/locale';
import { normalizeLocale } from '../../../notifications/locale';
import type { LabelWords } from './types';
import { en } from './en';
import { de } from './de';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';

export type { LabelWords, ExplainWords } from './types';

/** Every attendance label's words, in the five languages the product speaks. The ONE copy. */
export const LABEL_WORDS: Readonly<Record<SupportedLocale, LabelWords>> = { en, de, es, fr, it };

/** The words for a reader's language; anything unknown reads English. Accepts "de-AT", "de_DE"… */
export function labelWordsFor(locale: string | null | undefined): LabelWords {
  return LABEL_WORDS[normalizeLocale(locale) ?? 'en'];
}
