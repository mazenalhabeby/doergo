/** Small pure helpers: a signature image, keys and ids, inline display, names, event context. */
import { BadRequestException } from '@nestjs/common';
import { documentTypeKey } from '@hbcfield/shared';
import { ALLOWED_MIME, type RequestContext } from './actor';

/**
 * Turn the signature pad's output into PNG bytes.
 *
 * The pad hands back a data URL. It is decoded and checked here rather than
 * stored as-is, because a base64 string in a database column is the mistake
 * three other signature fields in this schema already make — and because the
 * bytes have to be real for the seal to embed them.
 */
export function decodeSignaturePng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match?.[1]) {
    throw new BadRequestException('The signature could not be read. Please sign again.');
  }
  const png = Buffer.from(match[1].replace(/\s/g, ''), 'base64');

  // A PNG starts with a fixed eight-byte signature. Checking it stops anything
  // that is not an image from being embedded in a legal document.
  const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 100 || !png.subarray(0, 8).equals(MAGIC)) {
    throw new BadRequestException('The signature could not be read. Please sign again.');
  }
  // A drawn signature is a few tens of kilobytes. Anything far larger is not one.
  if (png.length > 2 * 1024 * 1024) {
    throw new BadRequestException('That signature image is too large.');
  }
  return png;
}

/** Machine keys are lowercase, underscore-separated, and stable. */
/**
 * The shared rule, not a second copy of it.
 *
 * The types screen shows the key WHILE somebody types the label. If the two
 * normalisers ever disagreed, the key on screen and the key in the database
 * would differ — and the key is what a type is identified by for the rest of
 * its life.
 */
export function normaliseKey(raw: string): string {
  return documentTypeKey(raw);
}

/** A staging-key suffix. Not an id — nothing is stored under it. */
export function cuidish(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** What the browser should call the saved file. */
/**
 * May a browser be asked to render this, rather than save it?
 *
 * Reads ALLOWED_MIME rather than listing types again: the set of things this
 * product accepts and the set it will render inline must not drift apart. A
 * type that can execute — HTML, SVG — must never be added to that list without
 * this being reconsidered.
 */
export function canRenderInline(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, mimeType);
}

/**
 * The word printed beside a signature in the block.
 *
 * Three marks in a column are indistinguishable without it — and "MEMBER" is
 * the schema's word, not one anybody reading a time sheet would use.
 */
export function roleLabel(role: string | null): string {
  switch (role) {
    case 'MEMBER': return 'Member';
    case 'RESPONSIBLE': return 'Responsible';
    case 'ORG_REPRESENTATIVE': return 'For the company';
    case 'CUSTOMER': return 'Customer';
    // A document with no route has one signature and nothing to distinguish.
    default: return 'Signed by';
  }
}

export function downloadName(title: string, mimeType: string): string {
  const ext = ALLOWED_MIME[mimeType] ?? 'pdf';
  const safe = title.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120) || 'document';
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

/** Request provenance, flattened onto an event row. */
/**
 * The ids a bulk action may touch: de-duplicated, non-empty, at most 100.
 * A cap keeps one request from turning into an unbounded transaction.
 */
export function boundedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new BadRequestException('documentIds must be a list');
  const out = [...new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64))];
  if (out.length === 0) throw new BadRequestException('Choose at least one document');
  if (out.length > 100) throw new BadRequestException('At most 100 documents at a time');
  if (out.length !== ids.length && new Set(ids).size === ids.length) {
    throw new BadRequestException('documentIds must be document ids');
  }
  return out;
}

export function eventContext(ctx?: RequestContext) {
  return {
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    appVersion: ctx?.appVersion ?? null,
    lat: ctx?.lat ?? null,
    lng: ctx?.lng ?? null,
  };
}

/** Two id lists naming the same set, whatever their order. */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}
