import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { memberMayDelete, findPrior } from '@hbcfield/shared';
import {
  type DocumentActor,
  assertUploadable,
  ownStagingPrefix,
  assertStagingKey,
  cuidish,
  eventContext,
} from '../core/document-common';
import { DocumentSupplyBase } from './document-supply.base';
import { extraSheets, ownDocumentRow, parseOwnExpiry, type SubmitOwnDocumentInput } from './own-document-steps';

/**
 * What the member supplies themselves, and what is still required of them.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentSupplyService extends DocumentSupplyBase {
  async presignOwnUpload(data: { actor: DocumentActor; typeId: string; mimeType: string; sizeBytes: number }) {
    this.assertNotExternal(data.actor);
    const store = this.storage.requireStore();
    const extension = assertUploadable(data.mimeType, data.sizeBytes);
    await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    const staging = `${ownStagingPrefix(data.actor.organizationId, data.actor.userId)}${cuidish()}.${extension}`;
    return this.storage.withStorage('preparing an upload', () =>
      store.presignUpload(staging, data.mimeType, data.sizeBytes),
    );
  }

  /**
   * Step two: file what the member uploaded, as PENDING_VERIFICATION.
   *
   * Pending, never issued. A photograph somebody took of a card they say is
   * theirs is a claim, not a record — and the dispatch gate reads
   * `status IN ('ISSUED','SIGNED')`, so an unreviewed upload cannot clear a
   * requirement no matter what expiry date came with it. That is the difference
   * between tracking certificates and being told you have them.
   *
   * The member id is taken from the token and never from the body. There is no
   * shape of this request that files a document into somebody else's record.
   */
  async submitOwnDocument(data: SubmitOwnDocumentInput) {
    // Checked here as well as at presign: presign is a courtesy, this is the
    // step that would actually file the document.
    this.assertNotExternal(data.actor);

    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.document.findUnique({ where: { id } }),
      isSame: (d) => d.userId === data.actor.userId && d.organizationId === data.actor.organizationId,
    });
    if (prior) return prior;
    assertStagingKey(data.stagingKey, ownStagingPrefix(data.actor.organizationId, data.actor.userId));
    const type = await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    // A missing expiry is filed and settled at verification — see parseOwnExpiry.
    const expiresOn = parseOwnExpiry(data.expiresOn);

    const member = await this.prisma.user.findFirst({
      where: { id: data.actor.userId, organizationId: data.actor.organizationId },
      /*
        `dateOfBirth` is selected so `checkScan` can COMPARE rather than merely
        judge plausibility.

        It used to be left out with a note that the User model held no birthday,
        which made the comparison in `dobCheck` unreachable: every scan settled
        for "this date belongs to a working-age person" when it could have
        asked "is this the same person". Null is still fine — the check falls
        back to plausibility exactly as before for anyone whose record has no
        birthday on it.
      */
      select: { id: true, firstName: true, lastName: true, email: true, dateOfBirth: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const extraPages = extraSheets(data);

    const filed = await this.storage.takeStagedObject(
      data.actor.organizationId,
      data.stagingKey,
      ownStagingPrefix(data.actor.organizationId, data.actor.userId),
      data.crop,
      data.backStagingKey ? { key: data.backStagingKey, crop: data.backCrop ?? null } : null,
      extraPages.map((key) => ({ key, crop: null })),
    );

    /*
      Read the zone off the picture when the phone did not already have one.

      A barcode read on the device is exact and free, so it wins. Everything
      else — every passport, every European ID card — has no barcode and a zone
      the camera cannot decode, so it is read here.

      The scan NEVER decides whether the upload succeeds. An unreadable photo,
      a slow OCR, a document with no zone at all: each files the document with
      no verdict, exactly as a gas certificate does.
    */
    /*
      ⚠️ NO SERVER READ HERE ANY MORE. It ran inline with a 12-second limit, so
      the member waited on it and a dense page (a visa foil) timed out and was
      filed unread. The phone's own reading, when it sent one, is used now; the
      server's read runs after filing in DocumentReadQueue, with all the time it
      needs, and its answer reaches the reviewer before they open the queue.
    */
    const mrzText = data.mrzText?.trim() || null;

    const scan = await this.checkSubmittedScan(mrzText, member, data.actor.organizationId);

    const issuedAt = new Date();

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: ownDocumentRow({ data, type, filed, scan, issuedAt, expiresOn }),
      });
      await tx.documentEvent.create({
        data: {
          documentId: created.id,
          type: 'SUBMITTED',
          meta: scan ? { scanVerdict: scan.verdict, scanFormat: scan.format } : undefined,
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
      return created;
    });

    await this.notifier.notifySubmitted(document.id, data.actor.organizationId, member, type.label, document.title);
    // Anything not already settled is read in the background, after this returns.
    if (!document.expiresOn || !scan) this.readQueue?.enqueue(document.id);
    return document;
  }

  /**
   * A member removing something they supplied themselves.
   *
   * Only ever their own, only ever SUPPLIED. Direction is the whole rule: a
   * payslip the member could remove is not a record of anything.
   */
  async deleteOwnSupplied(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: data.documentId,
        organizationId: data.actor.organizationId,
        userId: data.actor.userId,
      },
      include: { type: { select: { direction: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');

    // On a BOTH type only their OWN upload: a copy the office filed carries `issuedById`.
    if (!memberMayDelete(document.type.direction, document.issuedById === null)) {
      throw new ForbiddenException('This document was issued to you and cannot be removed');
    }

    await this.prisma.document.delete({ where: { id: document.id } });

    // The object is left in place deliberately: it is content-addressed, so
    // another member's identical file may point at the same bytes. Orphans are
    // collected by the retention sweep, which can see the whole picture.
    return { success: true };
  }
}
