/**
 * Text compared without accents: "Müller" and "Muller", "José" and "Jose".
 * NFD splits a letter from its accent; the combining marks are then dropped.
 * Not a transliteration — "ß" and "Ä" → "AE" are a caller's own rule.
 */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** `stripDiacritics` + lower case — the usual key for matching words. */
export function foldText(s: string): string {
  return stripDiacritics(s).toLowerCase();
}
