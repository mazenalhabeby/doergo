import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { findPrior, personName, memberMaySupply, checkScan, PrismaService } from '@hbcfield/shared';
import {
  type DocumentActor,
  assertUploadable,
  ownStagingPrefix,
  assertStagingKey,
  cuidish,
  eventContext,
  type RequestContext,
} from '../core/document-common';
import { DocumentReadQueue } from '../reading/document-read-queue.service';
import { DocumentStorageService } from '../core/document-storage.service';
import { DocumentLookupService } from '../core/document-lookup.service';
import { DocumentNotifierService } from '../core/document-notifier.service';
import { extraSheets, ownDocumentRow, parseOwnExpiry, type SubmitOwnDocumentInput } from './own-document-steps';
import { withdrawOwnDocument } from './own-document-withdraw';

/**
 * What the member supplies themselves, and what is still required of them.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
@Injectable()
export class DocumentSupplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly lookup: DocumentLookupService,
    private readonly notifier: DocumentNotifierService,
    // Optional so the many unit tests that build this service bare keep working.
    @Optional() private readonly readQueue?: DocumentReadQueue,
  ) {}

  /**
   * Step one, for the member: a link their own device can PUT the file to.
   *
   * NO PERMISSION IS CHECKED, and none ever will be. Supplying your own driving
   * licence is not an administrative act — it is the only way the organization
   * can get a document that only you possess. What is checked instead is the
   * TYPE: a member may upload against a SUPPLIED type and nothing else, so this
   * can never become a way to file yourself a payslip.
   */
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
  async deleteOwnSupplied(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    return withdrawOwnDocument(this.prisma, this.storage, data);
  }

  /**
   * Nobody uploads a personnel document for somebody else's employee.
   *
   * The company asks an external member for nothing — `requirementsFor` returns
   * an empty list for them — and the other half of that has to be true too: a
   * file we never asked for should not be accepted either. Otherwise a client's
   * supervisor uploads their passport into our organization's personnel store,
   * and we are holding an outsider's identity documents with no reason to and
   * no policy covering them.
   *
   * Refused rather than hidden, because hiding a button is a courtesy and this
   * is a rule. Signing is untouched: countersigning a document we sent them is
   * the one document flow that IS theirs.
   */
  private assertNotExternal(actor: DocumentActor) {
    if (actor.isExternal) {
      throw new BadRequestException('External members do not have a personnel file — nothing is required from them');
    }
  }

  /**
   * Run the offline checks over whatever the scanner read.
   *
   * The one question this cannot answer alone is "has anybody else already
   * filed this exact document" — a database question — so it is resolved here
   * and handed to the pure checker.
   */
  private async checkSubmittedScan(
    mrzText: string | null | undefined,
    member: { id: string; firstName: string; lastName: string; dateOfBirth?: Date | null },
    organizationId: string,
  ) {
    if (!mrzText?.trim()) return null;

    // Parse first, so the duplicate lookup has a number to look for.
    const provisional = checkScan({ mrzText, member });
    const documentNumber = provisional.extracted.documentNumber;

    let alreadyFiledBy: string | null = null;
    if (documentNumber) {
      /*
        The same document number under two names.

        Indexed on [organizationId, documentNumber]. Scoped to the organization
        deliberately: whether a licence appears in ANOTHER company's records is
        not this customer's business, and answering across tenants would leak
        one customer's workforce to another.
      */
      const other = await this.prisma.document.findFirst({
        where: {
          organizationId,
          documentNumber,
          userId: { not: member.id },
          status: { in: ['ISSUED', 'SIGNED', 'PENDING_VERIFICATION'] },
        },
        select: { user: { select: { firstName: true, lastName: true } } },
      });
      if (other) {
        alreadyFiledBy = personName(other.user);
      }
    }

    return checkScan({ mrzText, member, alreadyFiledBy });
  }

  /**
   * The type must exist, be in use, and be one the member is allowed to supply.
   *
   * Direction is the whole rule and it is enforced on the server every time,
   * not by which types the screen chose to offer.
   */
  private async assertMemberSuppliableType(typeId: string, organizationId: string) {
    const type = await this.lookup.findTypeOr404(typeId, organizationId);
    if (!type.isActive) {
      throw new BadRequestException('That document type is no longer in use');
    }
    if (!memberMaySupply(type.direction)) {
      throw new ForbiddenException(`${type.label} is issued by your organization — you cannot upload one yourself`);
    }
    return type;
  }
}

