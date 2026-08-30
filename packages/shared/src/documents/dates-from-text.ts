/**
 * Dates read off a document that has no machine-readable zone.
 *
 * Passports and ID cards carry an MRZ, so their expiry is read exactly and
 * proved by a check digit. NOTHING ELSE DOES. A European driving licence has no
 * MRZ at all, and neither does a gas certificate or a first-aid card — so for
 * those, the only thing available is the printed text, and the only honest
 * status for anything found there is A SUGGESTION.
 *
 * That distinction runs through the whole module. An MRZ expiry is a fact the
 * document proves about itself; a date scraped from printed text is a guess
 * good enough to save somebody typing, and it is offered for confirmation, never
 * filed as read.
 *
 * The guess is better than it sounds for the documents this product files. An
 * EU driving licence prints exactly three dates in numbered fields — 3 is the
 * date of birth, 4a the issue date, 4b the expiry — and the expiry is always
 * the latest of them. A certificate prints an issue date and an expiry, and the
 * expiry is later. "The furthest in the future" is therefore right far more
 * often than not, and wrong in a way the member sees and corrects before they
 * send it.
 */

export interface FoundDate {
  /** ISO, always. */
  iso: string;
  /** Exactly as it was printed, for showing back to a person. */
  raw: string;
}

/**
 * Every date in a block of text, in the formats these documents print.
 *
 * Deliberately narrow. Accepting more formats does not find more dates on a
 * driving licence; it finds more NON-dates in the noise an OCR returns from a
 * hologram, and each of those is a wrong suggestion somebody has to notice.
 */
export function findDates(text: string, now: Date = new Date()): FoundDate[] {
  const out: FoundDate[] = [];
  const seen = new Set<string>();

  const push = (y: number, m: number, d: number, raw: string) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    // A document nobody alive is holding, or one issued a century early: the
    // OCR read something that was not a date.
    if (y < now.getFullYear() - 120 || y > now.getFullYear() + 60) return;
    const date = new Date(Date.UTC(y, m - 1, d));
    // Rejects 31 February, which the range check above lets through.
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
    const iso = date.toISOString().slice(0, 10);
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push({ iso, raw });
  };

  // 31.12.2030 / 31-12-2030 / 31/12/2030 — the European order, which is what
  // every document in this product's market prints.
  for (const m of text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/g)) {
    push(Number(m[3]), Number(m[2]), Number(m[1]), m[0]);
  }
  // 2030-12-31 — ISO, printed on some certificates.
  for (const m of text.matchAll(/\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), m[0]);
  }
  // 31.12.30 — two digits, and only where the century is unambiguous: a date
  // on one of these documents is never more than a few decades either way.
  for (const m of text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})\b(?!\d)/g)) {
    const yy = Number(m[3]);
    const century = now.getFullYear() - (now.getFullYear() % 100);
    const year = century + yy > now.getFullYear() + 60 ? century - 100 + yy : century + yy;
    push(year, Number(m[2]), Number(m[1]), m[0]);
  }

  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Which of them is probably the expiry.
 *
 * The latest one in the future. On an EU driving licence the three printed
 * dates are birth, issue and expiry, in that order — so the last is the expiry.
 * On a certificate it is issue and expiry, and the expiry is later.
 *
 * Returns null rather than guessing when the only dates found are in the past:
 * a document whose every date has gone is either expired, in which case the
 * member should say so deliberately, or misread, in which case a confident
 * suggestion is worse than none.
 */
export function suggestExpiry(text: string, now: Date = new Date()): FoundDate | null {
  const future = findDates(text, now).filter((d) => new Date(d.iso).getTime() > now.getTime());
  return future.length > 0 ? future[future.length - 1]! : null;
}
