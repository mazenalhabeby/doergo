import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Rect, rectToPixels, isUsefulCrop } from '@hbcfield/shared';
import { ObjectStore, documentKey, sha256 } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OBJECT_STORE } from './object-store.provider';
import { openUntrustedImage } from './image-input';
import { assemblePagesPdf } from './pages-pdf';
import {
  MAX_DOCUMENT_BYTES,
  ALLOWED_MIME,
  ownStagingPrefix,
  sharedStagingPrefix,
  assertStagingKey,
} from './document-common';

/**
 * Object storage for the personnel file: staging, filing by content address, and freeing
 * bytes nobody points at any more. The only part of the module that holds the store.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Injected, not constructed here — see object-store.provider.ts. Null when
    // no credentials are configured; every path that needs it says so plainly.
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {
    if (!this.store) {
      this.logger.warn('S3 is not configured — document upload and download are unavailable');
    }
  }

  requireStore(): ObjectStore {
    if (!this.store) {
      throw new BadRequestException('Document storage is not configured on this server');
    }
    return this.store;
  }

  /**
   * Run a storage call and translate any failure into something a person can act on.
   *
   * The SDK's own messages are about buckets and regions — "The specified
   * bucket does not exist" told a payroll administrator nothing and, reaching a
   * toast verbatim, is exactly the class of leak this codebase already fixed
   * once for Prisma errors. The real message is logged; the caller gets a
   * sentence about their document.
   */
  async withStorage<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(`Storage failed while ${what}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Document storage is unavailable right now. Nothing was changed — please try again.',
      );
    }
  }

  /**
   * Take a staged object, hash it, and move it to its content-addressed home.
   *
   * `expectedPrefix` is the security boundary. The staging key comes back from
   * the client, so it is untrusted, and it is the one place a caller could try
   * to name somebody else's object. Administrators are confined to their
   * organization; a MEMBER is confined further, to their own folder — otherwise
   * a member who learned a staging key could confirm a colleague's payslip into
   * their own record.
   *
   * The hash is computed HERE, from the bytes as stored, so `sha256` on the row
   * is something this service calculated rather than something a client claimed.
   */
  async takeStagedObject(
    organizationId: string,
    stagingKey: string,
    expectedPrefix?: string,
    crop?: Rect | null,
    back?: { key: string; crop: Rect | null } | null,
    /**
     * Further sheets of the SAME document, in reading order.
     *
     * Present only for a plain multi-sheet upload — a hotel invoice, a flight
     * confirmation. Mutually exclusive with `back`, which is a property of
     * cards: a card has a reverse, a stack of paper has a page 2.
     */
    pages?: { key: string; crop: Rect | null }[] | null,
  ): Promise<{ key: string; hash: string; sizeBytes: number; mimeType: string; bytes: Buffer }> {
    // Checked again here, not only by the caller. This method reads and moves
    // an object named by untrusted input, so it does not rely on having been
    // called correctly.
    assertStagingKey(stagingKey, expectedPrefix ?? sharedStagingPrefix(organizationId));

    const store = this.requireStore();

    const head = await this.withStorage('checking an upload', () => store.head(stagingKey));
    if (!head.exists) {
      throw new BadRequestException('The upload did not complete — please try again');
    }
    if (head.sizeBytes > MAX_DOCUMENT_BYTES) {
      await store.delete(stagingKey);
      throw new BadRequestException('That file is larger than the limit');
    }

    const staged = await this.withStorage('reading an upload', () => store.get(stagingKey));
    /*
      Cropped and joined BEFORE it is hashed, because the hash has to describe
      the bytes that are stored. Hashing one side and storing two would make the
      integrity check fail against the document's own file for ever.
    */
    const cropped = await this.applyCrop(staged, crop);

    let bytes = cropped;
    let mimeType = head.contentType ?? 'application/pdf';

    if (pages && pages.length > 0) {
      /*
        Sheets of paper, filed as one PDF.

        ⚠️ Fetched and cropped in PARALLEL. One round trip per sheet, awaited in
        turn, is the obvious shape and makes a six-page upload six times slower
        than it needs to be — the calls are independent and the store is remote.

        ⚠️ A sheet that did not arrive is SKIPPED, not fatal. Losing page four
        of six is bad; losing all six because page four's PUT was interrupted is
        worse, and the member cannot tell the difference from the failure.
      */
      for (const page of pages) {
        assertStagingKey(page.key, expectedPrefix ?? sharedStagingPrefix(organizationId));
      }
      const extra = await Promise.all(
        pages.map(async (page) => {
          try {
            const pageHead = await this.withStorage('checking an upload', () => store.head(page.key));
            if (!pageHead.exists) return null;
            const raw = await this.withStorage('reading an upload', () => store.get(page.key));
            return await this.applyCrop(raw, page.crop);
          } catch {
            return null;
          }
        }),
      );

      const sheets = [cropped, ...extra.filter((b): b is Buffer => b !== null)];
      if (sheets.length > 1) {
        try {
          bytes = await assemblePagesPdf(sheets);
          mimeType = 'application/pdf';
        } catch (err) {
          // One sheet filed beats a failed upload — the same rule the two-sided
          // path follows when the reverse cannot be joined.
          this.logger.warn(`Could not join the pages: ${(err as Error).message}`);
        }
      }

      // Claimed or not, the staged sheets are litter once we are past here.
      await Promise.all(
        pages.map((page) => store.delete(page.key).catch(() => undefined)),
      );

      if (bytes.length > MAX_DOCUMENT_BYTES) {
        throw new BadRequestException('That document is larger than the limit');
      }
    } else if (back) {
      // The reverse comes from the client too, so it gets the same check.
      assertStagingKey(back.key, expectedPrefix ?? sharedStagingPrefix(organizationId));
      const backHead = await this.withStorage('checking an upload', () => store.head(back.key));
      if (backHead.exists) {
        const backRaw = await this.withStorage('reading an upload', () => store.get(back.key));
        bytes = await this.composeSides(cropped, await this.applyCrop(backRaw, back.crop));
        // The composite is written as JPEG whatever the two sides arrived as.
        if (bytes !== cropped) mimeType = 'image/jpeg';
      }
      // Removed either way: a staged object nobody claimed is litter, and a
      // failure to tidy up must not lose a document that is otherwise filed.
      try {
        await store.delete(back.key);
      } catch {
        /* left for the retention sweep */
      }
    }

    const hash = sha256(bytes);
    const extension = ALLOWED_MIME[mimeType] ?? 'pdf';
    const key = documentKey(organizationId, hash, extension);

    // Content-addressed, so re-putting identical bytes is a no-op that costs
    // one round trip. The same policy issued to thirty people is one object.
    await this.withStorage('filing a document', () => store.put(key, bytes, mimeType));
    await store.delete(stagingKey);

    // The bytes come back with the metadata: the OCR needs them, and fetching
    // the object a second time would double the storage round trips on every
    // upload for no gain.
    return { key, hash, sizeBytes: bytes.length, mimeType, bytes };
  }

  /**
   * Cut the photograph down to what was inside the scanner's frame.
   *
   * Without this the frame is decoration: the camera captures the whole sensor,
   * so a reviewer opens a picture of a kitchen worktop with a passport in the
   * middle of it, and the OCR — which looks for a machine-readable zone in the
   * lower part of the IMAGE — searches the lower part of the worktop.
   *
   * Never fatal. A crop that cannot be applied leaves the original, which is
   * exactly what was filed before this existed.
   */
  private async applyCrop(bytes: Buffer, crop?: Rect | null): Promise<Buffer> {
    if (!crop || !isUsefulCrop(crop)) return bytes;
    try {
      const sharp = (await import('sharp')).default;
      // `rotate()` first: the crop was computed against what the PHONE showed,
      // which already has the EXIF orientation applied, and extracting from the
      // unrotated buffer would cut a sideways rectangle out of the middle.
      //
      // The member's bytes go through the bounded opener; everything after is
      // our own output, whose dimensions we already know.
      const upright = await (await openUntrustedImage(bytes)).rotate().toBuffer();
      const meta = await sharp(upright).metadata();
      if (!meta.width || !meta.height) return bytes;

      const px = rectToPixels(crop, { width: meta.width, height: meta.height });
      if (px.width < 8 || px.height < 8) return bytes;

      return await sharp(upright).extract(px).toBuffer();
    } catch (err) {
      this.logger.warn(`Could not crop to the scanner frame: ${(err as Error).message}`);
      return bytes;
    }
  }

  /**
   * Two sides of one card, as one image.
   *
   * A European ID card or driving licence carries the categories and the
   * machine-readable zone on the BACK, so the scanner asks for both — and the
   * back was then thrown away, which meant the reader searched a front that has
   * no zone on it at all. That is the whole of "it reads nothing" for a card.
   *
   * Stacked into a single file rather than stored as two, because a document is
   * one thing: one row, one hash, one retention date, and a reviewer who sees
   * both sides without hunting for a second attachment. The reader gets both
   * too, and the zone lands in the lower part of the composite exactly where
   * the band search looks.
   */
  async composeSides(front: Buffer, back: Buffer | null): Promise<Buffer> {
    if (!back) return front;
    try {
      const sharp = (await import('sharp')).default;

      // A common width, so neither side is stretched and the seam is straight.
      // Both sides are the member's, so both go through the bounded opener.
      const [f, b] = await Promise.all([
        (await openUntrustedImage(front)).rotate().toBuffer(),
        (await openUntrustedImage(back)).rotate().toBuffer(),
      ]);
      const [fm, bm] = await Promise.all([sharp(f).metadata(), sharp(b).metadata()]);
      if (!fm.width || !fm.height || !bm.width || !bm.height) return front;

      const width = Math.max(fm.width, bm.width);
      const [fr, br] = await Promise.all([
        sharp(f).resize({ width }).toBuffer(),
        sharp(b).resize({ width }).toBuffer(),
      ]);
      const [frm, brm] = await Promise.all([sharp(fr).metadata(), sharp(br).metadata()]);

      const gap = Math.round(width * 0.02);
      const height = (frm.height ?? 0) + gap + (brm.height ?? 0);

      return await sharp({
        create: { width, height, channels: 3, background: '#ffffff' },
      })
        .composite([
          { input: fr, top: 0, left: 0 },
          { input: br, top: (frm.height ?? 0) + gap, left: 0 },
        ])
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (err) {
      // Never fatal: one side filed beats a failed upload.
      this.logger.warn(`Could not join the two sides: ${(err as Error).message}`);
      return front;
    }
  }

  /** Fetch a staged object and cut it down to the frame, without consuming it. */
  async peekStaged(
    organizationId: string,
    stagingKey: string,
    userId: string,
    crop?: Rect | null,
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    assertStagingKey(stagingKey, ownStagingPrefix(organizationId, userId));
    const store = this.requireStore();
    const head = await this.withStorage('checking an upload', () => store.head(stagingKey));
    if (!head.exists) {
      throw new BadRequestException('The upload did not complete — please try again');
    }
    /*
      ⚠️ Bounded BEFORE it is read into memory and decoded. This path ("read it
      before I send it") had no size check at all — the presign caps what a
      member DECLARES, not what lands in the bucket — so an oversized object was
      pulled whole into the process and handed to sharp and the OCR. Same limit
      as filing a document; the pixel bound is `openUntrustedImage`'s.
    */
    if (typeof head.sizeBytes === 'number' && head.sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(`That file is larger than the ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`);
    }
    const raw = await this.withStorage('reading an upload', () => store.get(stagingKey));
    if (raw.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(`That file is larger than the ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`);
    }
    const bytes = await this.applyCrop(raw, crop);
    /*
      ⚠️ The type CAME BACK WITH THE OBJECT and was being thrown away, then
      replaced with a hard-coded 'image/jpeg' at the read. A staged PDF was
      therefore handed to sharp as a JPEG, which threw, which was caught and
      logged as a failed read — the right ANSWER by way of an exception and a
      warning line per upload. Saying "this is a PDF" up front makes the refusal
      deliberate, and is what lets the caller explain itself.

      `applyCrop` returns the buffer UNCHANGED when there is no usable crop, and
      a new one when it cropped — which it can only have done to an image. So an
      identity check is what tells the two apart, and a PDF (which the crop
      silently declines) keeps the type it arrived with.
    */
    const mimeType = bytes !== raw ? 'image/jpeg' : head.contentType ?? 'application/octet-stream';
    return { bytes, mimeType };
  }

  /**
   * Remove a document's file — but ONLY if no other document is that file.
   *
   * ⚠️ Storage keys are CONTENT-ADDRESSED (`documentKey(org, hash, ext)`), which
   * is why the same policy issued to thirty people costs one object. The direct
   * consequence: deleting the object because ONE row went away would take the
   * file out from under the other twenty-nine, and they would keep listing
   * normally and fail only when somebody tried to open one.
   *
   * So the row goes first and the object goes only when nothing points at it.
   * Never throws — an orphaned object costs a fraction of a cent, while a failed
   * cleanup that undid a deletion would cost a document.
   */
  async freeStorageIfUnreferenced(storageKey: string): Promise<void> {
    try {
      // A key may be one document's current file, another's original, or a
      // sealed copy that a later signature moved past — all are "in use".
      const stillUsed = await this.prisma.document.count({
        where: { OR: [{ storageKey }, { originalKey: storageKey }] },
      });
      if (stillUsed > 0) return;
      const store = this.store;
      if (store) await store.delete(storageKey);
    } catch (err) {
      this.logger.warn(`Could not free ${storageKey}: ${(err as Error).message}`);
    }
  }

  /** A signature image goes when no remaining signature row uses it. Never throws. */
  async freeSignatureImageIfUnreferenced(key: string): Promise<void> {
    try {
      if ((await this.prisma.documentSignature.count({ where: { signatureKey: key } })) > 0) return;
      if (this.store) await this.store.delete(key);
    } catch (err) {
      this.logger.warn(`Could not free ${key}: ${(err as Error).message}`);
    }
  }
}
