import { BadRequestException, Injectable } from '@nestjs/common';
import { type Rect } from '@hbcfield/shared';
import { documentKey, sha256 } from '@hbcfield/shared/storage';
import { assemblePagesPdf } from './pages-pdf';
import {
  MAX_DOCUMENT_BYTES,
  ALLOWED_MIME,
  ownStagingPrefix,
  sharedStagingPrefix,
  assertStagingKey,
} from './document-common';
import { DocumentStorageBase } from './document-storage.base';

/**
 * Object storage for the personnel file: staging, filing by content address, and freeing
 * bytes nobody points at any more. The only part of the module that holds the store.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentStorageService extends DocumentStorageBase {

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
