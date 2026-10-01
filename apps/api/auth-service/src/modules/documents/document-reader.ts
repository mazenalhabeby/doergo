import { Injectable } from '@nestjs/common';
import { checkScan, suggestExpiry, type ScanResult } from '@hbcfield/shared';
import { MrzOcrService } from './mrz-ocr.service';

/**
 * ONE SHAPE FOR EVERY READER.
 *
 * Today the only engine is the on-server OCR plus the shared rules. Later a
 * local AI model (on the company's own GPU server) or a cloud one joins it —
 * as another `DocumentReader`, registered under DOCUMENT_READERS. Nothing that
 * consumes a reading (the queue, the review screen, the approval) knows or
 * cares which engine produced it; it reads `certainty` and `source`.
 */
export interface DocumentReading {
  /** ISO date, or null when nothing trustworthy was found. */
  expiresOn: string | null;
  /**
   * PROVEN — the document proves it about itself (zone check digits passed).
   * SUGGESTED — read from printed text or decoded without proof; a person confirms.
   */
  certainty: 'PROVEN' | 'SUGGESTED' | null;
  /** Where the date came from, for the reviewer: the zone, a barcode, a label, the latest date. */
  source: 'MRZ' | 'BARCODE' | 'LABEL' | 'TEXT' | null;
  /** The label it stood beside ("Valid until", "4b."), when there was one. */
  label: string | null;
  /** Which engine produced this — "ocr-rules" today. */
  engine: string;
  /** The zone/barcode checks, when a zone or barcode was found. */
  scan: ScanResult | null;
  /** Why nothing could be read, in a word the screen can translate. */
  unreadable: 'HEIC' | 'NOT_AN_IMAGE' | 'NO_TEXT' | null;
}

export interface ReadInput {
  bytes: Buffer;
  mimeType: string;
  member: { firstName: string; lastName: string; dateOfBirth?: Date | null };
}

export interface DocumentReader {
  readonly name: string;
  read(input: ReadInput): Promise<DocumentReading>;
}

/** The readers in the order they are tried. A later engine is added here, not anywhere else. */
export const DOCUMENT_READERS = 'DOCUMENT_READERS';

/** Background reads may take this long: nobody is waiting. */
const BACKGROUND_READ_TIMEOUT_MS = 90_000;

/**
 * iPhone photos are HEIC (HEVC inside an ISO box). The server's image library
 * has no HEVC decoder — a licensing matter, not a bug — so these must be
 * converted on the phone. Recognised by the box brand, never by the declared
 * type: the file that exposed this arrived labelled image/jpeg.
 */
export function isHeic(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.toString('latin1', 4, 8) !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(bytes.toString('latin1', 8, 12));
}

/**
 * The reader that needs nothing outside this server: tesseract for the pixels,
 * the shared rules for the meaning — the same rules the phone and the browser
 * run, so all three agree on what a document says.
 */
@Injectable()
export class OcrRulesReader implements DocumentReader {
  readonly name = 'ocr-rules';

  constructor(private readonly ocr: MrzOcrService) {}

  async read({ bytes, mimeType, member }: ReadInput): Promise<DocumentReading> {
    const nothing = (unreadable: DocumentReading['unreadable']): DocumentReading => ({
      expiresOn: null, certainty: null, source: null, label: null, engine: this.name, scan: null, unreadable,
    });
    if (isHeic(bytes)) return nothing('HEIC');
    if (!mimeType.startsWith('image/')) return nothing('NOT_AN_IMAGE');

    const text = await this.ocr.read(bytes, mimeType, { timeoutMs: BACKGROUND_READ_TIMEOUT_MS });
    if (!text) return nothing('NO_TEXT');

    const scan = checkScan({ mrzText: text, member });

    // The zone agrees with its own arithmetic: the one date that is a fact.
    if (scan.raw?.allChecksPassed && scan.extracted.dateOfExpiry) {
      return { expiresOn: scan.extracted.dateOfExpiry, certainty: 'PROVEN', source: 'MRZ', label: null, engine: this.name, scan, unreadable: null };
    }
    // A barcode is decoded, not guessed — but carries no proof.
    if (!scan.raw && scan.format && scan.extracted.dateOfExpiry) {
      return { expiresOn: scan.extracted.dateOfExpiry, certainty: 'SUGGESTED', source: 'BARCODE', label: null, engine: this.name, scan, unreadable: null };
    }

    /*
      No proven date. The band read covers the lower third of the picture; the
      printed date is usually higher, so read the whole page before the rules
      look for a label.
    */
    const page = scan.raw ? await this.ocr.read(bytes, mimeType, { wholeFrame: true, timeoutMs: BACKGROUND_READ_TIMEOUT_MS }) : text;
    const found = suggestExpiry(page ?? text);
    return {
      expiresOn: found?.iso ?? null,
      certainty: found ? 'SUGGESTED' : null,
      source: found ? (found.basis === 'LABEL' ? 'LABEL' : 'TEXT') : null,
      label: found?.label ?? null,
      engine: this.name,
      scan: scan.raw || scan.format ? scan : null,
      unreadable: null,
    };
  }
}
