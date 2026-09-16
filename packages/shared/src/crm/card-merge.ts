/**
 * Several looks at the same card, combined into one.
 *
 * ⚠️ THE FAILURE THIS EXISTS FOR IS NOT PARSING. A real card came back with no
 * email at all, and the parser was blameless: the photo was taken at an angle
 * with a hard shadow across the half where the address sat, and the recogniser
 * never produced that line. No rule recovers text that was never read.
 *
 * What does recover it is looking twice. A hand holding a phone moves, the
 * autofocus settles, the exposure adapts — so consecutive frames of a still
 * card are NOT the same picture, and a line lost to glare in one is usually
 * present in the next. Merging a few passes costs no extra permission, no
 * network, and no model: it is the largest accuracy win available on-device.
 *
 * ⚠️ A LINE SEEN ONCE IS STILL KEPT. The temptation is to demand a line appear
 * in a majority of passes, which reads as rigorous and quietly deletes every
 * small-print line the recogniser only catches on its best frame — the VAT
 * number, the mobile. Agreement raises CONFIDENCE here; it is never a
 * condition of survival.
 */

import type { CardLine } from './business-card';

/** A line, plus how many passes saw it. */
export interface MergedCardLine extends CardLine {
  /** How many passes produced this line. 1 means "only the luckiest frame". */
  seen: number;
  /** How many passes there were, so a caller can judge `seen` against it. */
  passes: number;
}

/**
 * The comparison key for "is this the same line?".
 *
 * ⚠️ Folded hard on purpose. Two passes over one line differ in exactly the
 * ways that do not matter — a stray space, a comma read as a full stop, `l`
 * against `1`, an accent lost — and comparing raw text files those as separate
 * lines, which is worse than not merging at all: the review screen then shows
 * the same fact three times.
 *
 * The digit folds (`l|i→1`, `o→0`) are deliberate and one-directional: on a
 * phone number `l` is never an ell. It costs nothing on prose, because prose
 * lines differ by far more than one character.
 */
function key(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[lі|]/g, '1')
    .replace(/[o]/g, '0')
    .replace(/[^a-z0-9@]/g, '');
}

/**
 * Which of several readings of one line to keep.
 *
 * The one seen most often wins; ties go to the LONGEST, because the
 * characteristic OCR failure is truncation — `dvd-personal` where the card says
 * `dvd-personal.com`, a phone missing its last digit. A longer reading of the
 * same line is nearly always the more complete one.
 */
function best(variants: readonly { line: CardLine; count: number }[]): CardLine {
  return [...variants].sort(
    (a, b) => b.count - a.count || b.line.text.length - a.line.text.length,
  )[0]!.line;
}

/**
 * Merge the passes, newest geometry wins, order restored by position.
 *
 * Passes may be of different lengths and any may be empty — a frame where the
 * card was out of focus contributes nothing and must not break the merge.
 */
export function mergeCardPasses(passes: readonly (readonly CardLine[])[]): MergedCardLine[] {
  const real = passes.filter((p) => p && p.length > 0);
  if (real.length === 0) return [];
  if (real.length === 1) {
    return real[0]!.map((line) => ({ ...line, seen: 1, passes: 1 }));
  }

  // key → the readings of that line, and which passes contained it.
  const groups = new Map<string, { variants: Map<string, { line: CardLine; count: number }>; passes: Set<number> }>();

  real.forEach((pass, passIndex) => {
    for (const line of pass) {
      const text = (line?.text ?? '').trim();
      if (!text) continue;
      const k = key(text);
      // A line of pure punctuation folds to nothing; keeping it would merge
      // every such line on the card into one meaningless row.
      if (!k) continue;

      let group = groups.get(k);
      if (!group) {
        group = { variants: new Map(), passes: new Set() };
        groups.set(k, group);
      }
      group.passes.add(passIndex);
      const variant = group.variants.get(text);
      if (variant) variant.count += 1;
      else group.variants.set(text, { line, count: 1 });
    }
  });

  /*
    Truncation folds to a DIFFERENT key, so it never meets its own line.

    `dvd-personal` and `dvd-personal.com` are not near-misses of each other in
    the sense `key()` handles — one is a prefix of the other, which is what a
    lost tail looks like: a dropped TLD, a phone short its last digit.

    ⚠️ Bounded tightly, because prefix-merging is how two real places become
    one. `wien` is a prefix of `wienerneustadt` and `anna` of `annagruber`, and
    merging either would be a data loss disguised as tidiness. A genuine
    truncation is a handful of characters off the end of something already
    long, so: at least 6 characters, and at most 4 missing.
  */
  const keys = [...groups.keys()].sort((a, b) => b.length - a.length);
  const absorbed = new Map<string, string>();
  for (let i = 0; i < keys.length; i++) {
    const long = keys[i]!;
    if (absorbed.has(long)) continue;
    for (let j = i + 1; j < keys.length; j++) {
      const short = keys[j]!;
      if (absorbed.has(short)) continue;
      if (short.length >= 6 && long.length - short.length <= 4 && long.startsWith(short)) {
        absorbed.set(short, long);
      }
    }
  }
  for (const [short, long] of absorbed) {
    const from = groups.get(short);
    const into = groups.get(long);
    if (!from || !into) continue;
    for (const p of from.passes) into.passes.add(p);
    groups.delete(short);
  }

  const merged: MergedCardLine[] = [];
  for (const group of groups.values()) {
    const line = best([...group.variants.values()]);
    merged.push({ ...line, seen: group.passes.size, passes: real.length });
  }

  // Reading order: down the card, then across. Columns are the parser's
  // business — this only has to be stable and sane.
  return merged.sort((a, b) => a.y - b.y || (a.x ?? 0) - (b.x ?? 0));
}

/* ------------------------------------------------------------------ */

/** How well the card was read, for deciding whether to say so. */
export interface CardReadQuality {
  lines: number;
  /** Lines every pass agreed on, as a fraction of all lines. 1 with one pass. */
  agreement: number;
  /** Should the member be offered another try? */
  poor: boolean;
}

/**
 * Was that a good look at the card?
 *
 * ⚠️ Said OUT LOUD when it was not. The alternative — presenting four confident
 * fields from a photograph that half failed — is what makes a reader feel
 * broken rather than merely imperfect, because the member has no way to know
 * that anything is missing. "Part of this card could not be read" is a smaller
 * failure than a client saved without their email.
 */
export function cardReadQuality(lines: readonly MergedCardLine[]): CardReadQuality {
  if (lines.length === 0) return { lines: 0, agreement: 0, poor: true };
  const passes = lines[0]!.passes;
  const agreed = lines.filter((l) => l.seen >= passes).length;
  const agreement = agreed / lines.length;
  return {
    lines: lines.length,
    agreement,
    /*
      A business card carries a name, a company, a phone and usually an email
      and an address — five or six lines at the very least. Fewer than four and
      something was missed, whatever the recogniser's own confidence says.

      The agreement floor only applies with more than one pass; a single pass
      agrees with itself by definition and would otherwise always read "poor".
    */
    poor: lines.length < 4 || (passes > 1 && agreement < 0.5),
  };
}
