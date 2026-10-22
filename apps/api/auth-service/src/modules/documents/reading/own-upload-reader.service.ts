import { Injectable } from '@nestjs/common';
import { checkScan, suggestExpiry, type Rect } from '@hbcfield/shared';
import { MrzOcrService } from './mrz-ocr.service';
import { type DocumentActor } from '../core/document-common';
import { DocumentStorageService } from '../core/document-storage.service';
import { DocumentLookupService } from '../core/document-lookup.service';

/**
 * Reading a page a member uploaded of their own — the expiry and the document's
 * name off the page, before they file it.
 */
@Injectable()
export class OwnUploadReaderService {
  constructor(
    private readonly ocr: MrzOcrService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
  ) {}

  /**
   * Read a staged upload and say what is on it — WITHOUT filing anything.
   *
   * This exists because the flow was backwards. The member typed an expiry
   * date, sent the document, and the server then read the real one and quietly
   * used it instead: busywork followed by a silent override, which is the worst
   * of both. Reading first turns it into what every identity flow does — the
   * machine reads, the person confirms.
   *
   * The distinction in the answer is the important part. An expiry from a
   * machine-readable zone is a FACT the document proves about itself, with a
   * check digit behind it. An expiry scraped from printed text is a SUGGESTION,
   * because a European driving licence has no zone at all and nothing about
   * that reading is provable. The caller is told which it got.
   *
   * The staged object is left where it is: the member may still change their
   * mind, and `submitOwnDocument` is what consumes it.
   */
  async readOwnUpload(data: {
    actor: DocumentActor;
    stagingKey: string;
    crop?: Rect | null;
    /** The reverse, for a card that carries its zone there. */
    backStagingKey?: string | null;
    backCrop?: Rect | null;
  }) {
    const { organizationId, userId } = data.actor;

    // The frame, not the room: an uncropped photo puts the zone somewhere the
    // band search will never look.
    const front = await this.storage.peekStaged(organizationId, data.stagingKey, userId, data.crop);
    const back = data.backStagingKey
      ? await this.storage.peekStaged(organizationId, data.backStagingKey, userId, data.backCrop)
      : null;

    /*
      A PDF cannot be read here, and the honest thing is to say so rather than
      to fail at it.

      Rasterising needs a renderer this service does not have — `pdf-lib`
      manipulates PDFs, it does not draw them. ⚠️ Which is NOT the end of the
      story for the member: the browser reads a PDF's TEXT LAYER before it
      uploads (`src/lib/pdf-text.ts`), and a text layer is the characters the
      document was written with rather than a guess at their shape, so it beats
      anything OCR could return. This answer is what lets that reading stand
      instead of being overwritten with a worse one.
    */
    if (!front.mimeType.startsWith('image/')) {
      return { source: 'NOTHING' as const, expiresOn: null, fields: null, verdict: null };
    }

    // Read the two sides together. On an ID card the zone is only on the back.
    const bytes = await this.storage.composeSides(front.bytes, back?.bytes ?? null);
    const text = await this.ocr.read(bytes, 'image/jpeg');

    if (!text) {
      return { source: 'NOTHING' as const, expiresOn: null, fields: null, verdict: null };
    }

    const member = await this.lookup.assertMemberOfOrg(data.actor.userId, data.actor.organizationId);
    const scan = checkScan({ mrzText: text, member });

    if (scan.raw) {
      const fields = {
        holderName: scan.extracted.holderName,
        documentNumber: scan.extracted.documentNumber,
        dateOfBirth: scan.extracted.dateOfBirth,
        issuingState: scan.extracted.issuingState,
      };

      /*
        A zone was read, and its arithmetic agrees. This is the only expiry in
        the product that is a FACT rather than a reading.
      */
      if (scan.raw.allChecksPassed) {
        return {
          source: 'MRZ' as const,
          expiresOn: scan.extracted.dateOfExpiry,
          fields,
          verdict: scan.verdict,
        };
      }

      /*
        The check digit disagrees, so the zone's own date is not offered — it
        would be a wrong date with the app's authority behind it.
        ⚠️ But that used to end the matter, and the member was left typing.
        The band is the lower third of the picture; the date is very often
        printed in the part of the page the band never covered. So look at the
        whole frame before giving up, and label what comes back as the guess it
        is. Costs a second pass, on the rare path where the first one failed.
      */
      const printed = await this.ocr.read(bytes, 'image/jpeg', { wholeFrame: true });
      const fallback = printed ? suggestExpiry(printed) : null;
      return {
        source: fallback ? ('TEXT' as const) : ('NOTHING' as const),
        expiresOn: fallback?.iso ?? null,
        fields,
        verdict: scan.verdict,
      };
    }

    /*
      No zone: a licence, a certificate, an insurance card — which is MOST of
      what this product files.

      ⚠️ This branch was unreachable until the OCR stopped discarding text that
      did not look like a zone. `suggestExpiry` has been sitting here, tested
      and correct, never once called with anything but null.
    */
    const guess = suggestExpiry(text);
    return {
      source: guess ? ('TEXT' as const) : ('NOTHING' as const),
      expiresOn: guess?.iso ?? null,
      fields: null,
      verdict: null,
    };
  }
}
