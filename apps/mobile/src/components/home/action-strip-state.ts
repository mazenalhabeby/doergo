/**
 * What the home action strip says — pure, so the words are tested, not eyeballed.
 *
 * One item: NAME IT. More than one: one box, the count as the mark, and a
 * second line carrying the sharpest fact in the set (docs/design/
 * action-strip-many.html). Every input is already on
 * `DocumentRequirementsValue`; nothing here asks the server anything.
 *
 * ⚠️ NO AGE LINE. The design's "the oldest has waited 11 days" needs a date,
 * and `/documents/pending` carries none for any of the four kinds. The line
 * falls to the next sharpest fact that IS on the wire — never an invented one.
 */

export type StripKind = 'sentBack' | 'upload' | 'sign' | 'countersign' | 'expiring';

export interface StripItem {
  key: string;
  kind: StripKind;
  /** The document's name as the member knows it (type label or document title). */
  label: string;
  blocksWork: boolean;
  /** Supply-kind items open the upload sheet on this type. */
  typeId?: string;
  /** Sign-kind items open the signing flow on this document. */
  documentId?: string;
  /** Countersign: whose document it is. */
  forMember?: string | null;
  /** Expiring: whole days left, from `expiresOn`. */
  daysLeft?: number | null;
}

export interface StripInput {
  toUpload: { typeId: string; label: string; blocksWork: boolean }[];
  rejected: { typeId: string; label: string; blocksWork: boolean }[];
  toSign: { id: string; title: string; forMember?: string | null }[];
  expiringSoon: { typeId: string; label: string; expiresOn: string | null }[];
}

/*
  ⭐ ONE ORDER, the design's slot ranks:
    sent back & blocking → never sent & blocking → sent back → yours to sign →
    somebody else's to sign → never sent → running out.
  Sent back outranks never-sent because the member believes it is done.
*/
function rank(i: StripItem): number {
  if (i.kind === 'sentBack' && i.blocksWork) return 0;
  if (i.kind === 'upload' && i.blocksWork) return 1;
  if (i.kind === 'sentBack') return 2;
  if (i.kind === 'sign') return 3;
  if (i.kind === 'countersign') return 4;
  if (i.kind === 'upload') return 5;
  return 6;
}

export function stripItems(input: StripInput, now: number = Date.now()): StripItem[] {
  const items: StripItem[] = [
    ...input.rejected.map((r) => ({ key: `back:${r.typeId}`, kind: 'sentBack' as const, label: r.label, blocksWork: r.blocksWork, typeId: r.typeId })),
    ...input.toUpload.map((r) => ({ key: `up:${r.typeId}`, kind: 'upload' as const, label: r.label, blocksWork: r.blocksWork, typeId: r.typeId })),
    ...input.toSign.map((d) => ({
      key: `sign:${d.id}`, kind: d.forMember ? ('countersign' as const) : ('sign' as const),
      label: d.title, blocksWork: false, documentId: d.id, forMember: d.forMember ?? null,
    })),
    ...input.expiringSoon.map((r) => ({
      key: `exp:${r.typeId}`, kind: 'expiring' as const, label: r.label, blocksWork: false, typeId: r.typeId,
      daysLeft: r.expiresOn ? Math.max(0, Math.ceil((Date.parse(r.expiresOn) - now) / 86_400_000)) : null,
    })),
  ];
  // Stable within a rank: the server's own order (newest issued first) stands.
  return items.map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map((x) => x.it);
}

export type StripTone = 'crit' | 'warn' | 'calm';

/** Red only when work is actually stopped; no tint when all of it is merely running out. */
export function stripTone(items: StripItem[]): StripTone {
  if (items.some((i) => i.blocksWork)) return 'crit';
  if (items.every((i) => i.kind === 'expiring')) return 'calm';
  return 'warn';
}

/** A translation key and its values — the words live in the locale files. */
export interface Phrase { key: string; values?: Record<string, string | number> }

/** One item's own two lines. */
export function itemLines(i: StripItem): { title: Phrase; sub: Phrase } {
  const first = (i.forMember ?? '').split(' ')[0] || (i.forMember ?? '');
  switch (i.kind) {
    case 'sentBack':
      return {
        title: { key: 'strip.item.sentBack', values: { label: i.label } },
        sub: { key: i.blocksWork ? 'strip.item.sentBackBlocks' : 'strip.item.sentBackSub' },
      };
    case 'upload':
      return {
        title: { key: 'strip.item.upload', values: { label: i.label } },
        sub: { key: i.blocksWork ? 'strip.item.blocks' : 'strip.item.uploadSub' },
      };
    case 'sign':
      return {
        title: { key: 'strip.item.sign', values: { label: i.label } },
        sub: { key: 'strip.item.signSub' },
      };
    case 'countersign':
      return {
        title: { key: 'strip.item.countersign', values: { name: first, label: i.label } },
        sub: { key: 'strip.item.countersignSub', values: { name: i.forMember ?? '' } },
      };
    case 'expiring':
      return {
        title: i.daysLeft == null
          ? { key: 'strip.item.expiresSoon', values: { label: i.label } }
          : i.daysLeft === 0
            ? { key: 'strip.item.expiresToday', values: { label: i.label } }
            : { key: 'strip.item.expiresIn', values: { label: i.label, count: i.daysLeft } },
        sub: { key: 'strip.item.expiringSub' },
      };
  }
}

/**
 * The closed strip's two lines.
 *
 * ⚠️ With several, NEVER name one as the title — "Upload your ID card + 2"
 * makes somebody fix the ID card and expect the strip to go. The second line
 * may name a thing, because it states a fact about the set, not the task.
 */
export function stripLines(items: StripItem[]): { title: Phrase; sub: Phrase } | null {
  const n = items.length;
  if (n === 0) return null;
  if (n === 1) return itemLines(items[0]!);

  const blocking = items.filter((i) => i.blocksWork).length;
  const title: Phrase = blocking === n
    ? { key: 'strip.stopping', values: { count: n } }
    : { key: 'strip.needYou', values: { count: n } };

  // The stake beats everything: something is stopping work reaching them.
  if (blocking === n) return { title, sub: { key: 'strip.line.nothingReaches' } };
  if (blocking > 0) return { title, sub: { key: 'strip.line.someStop', values: { count: blocking } } };

  // Then the one they think is finished.
  const back = items.filter((i) => i.kind === 'sentBack');
  if (back.length === 1) return { title, sub: { key: 'strip.line.sentBackOne', values: { label: back[0]!.label } } };
  if (back.length > 1) return { title, sub: { key: 'strip.line.sentBackMany', values: { count: back.length } } };

  // Then a colleague on the other end — a name is harder to leave alone than a number.
  const other = items.find((i) => i.kind === 'countersign');
  if (other) return { title, sub: { key: 'strip.line.waitingOnYou', values: { name: other.forMember ?? '' } } };

  // Only things running out: a mention, not a demand.
  if (items.every((i) => i.kind === 'expiring')) {
    return { title, sub: { key: n === 2 ? 'strip.line.neitherUrgent' : 'strip.line.noneUrgent' } };
  }

  // What they are in for.
  const sign = items.filter((i) => i.kind === 'sign').length;
  const upload = items.filter((i) => i.kind === 'upload').length;
  if (sign && upload) return { title, sub: { key: 'strip.line.parts', values: { sign, upload } } };
  if (sign) return { title, sub: { key: 'strip.line.toSign', values: { count: sign } } };
  if (upload) return { title, sub: { key: 'strip.line.toUpload', values: { count: upload } } };
  return { title, sub: { key: 'strip.line.noneUrgent' } };
}
