import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  retentionUntil,
  memberMayDelete,
  memberMaySupply,
  requirementStatuses,
  waitingOnMember,
  checkScan,
  type Rect,
  isCurrentSigner,
  type SignerStep,
  findPrior,
} from '@hbcfield/shared';
import { DocumentReadQueue } from './document-read-queue.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MAX_PAGES } from './pages-pdf';
import {
  type DocumentActor,
  type RequestContext,
  assertUploadable,
  ownStagingPrefix,
  assertStagingKey,
  cuidish,
  eventContext,
} from './document-common';
import { DocumentStorageService } from './document-storage.service';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentNotifierService } from './document-notifier.service';
import { DocumentRoutingService } from './document-routing.service';

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
    private readonly routing: DocumentRoutingService,
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
      throw new BadRequestException(
        'External members do not have a personnel file — nothing is required from them',
      );
    }
  }

  async presignOwnUpload(data: {
    actor: DocumentActor;
    typeId: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    this.assertNotExternal(data.actor);
    const store = this.storage.requireStore();
    const extension = assertUploadable(data.mimeType, data.sizeBytes);
    await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    const staging =
      `${ownStagingPrefix(data.actor.organizationId, data.actor.userId)}${cuidish()}.${extension}`;
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
  async submitOwnDocument(data: {
    actor: DocumentActor;
    stagingKey: string;
    typeId: string;
    title?: string;
    expiresOn?: string | null;
    /**
     * Whatever a scanner read off the document — the machine-readable zone as
     * text. Optional: most documents here have no zone at all.
     */
    mrzText?: string | null;
    /** The scanner's frame, as fractions of the photograph. */
    crop?: Rect | null;
    /** The reverse of a two-sided card, filed as part of the same document. */
    backStagingKey?: string | null;
    /**
     * Further sheets, in reading order — a plain multi-sheet upload.
     *
     * ⚠️ Not combinable with `backStagingKey`: a card has a reverse, a stack of
     * paper has a page 2, and letting both through would silently decide which
     * one won.
     */
    pageStagingKeys?: string[] | null;
    backCrop?: Rect | null;
    ctx?: RequestContext;
    /** Made on the phone: the same document sent twice is filed once. */
    id?: string;
  }) {
    // Checked here as well as at presign: presign is a courtesy, this is the
    // step that would actually file the document.
    this.assertNotExternal(data.actor);

    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.document.findUnique({ where: { id } }),
      isSame: (d) => d.userId === data.actor.userId && d.organizationId === data.actor.organizationId,
    });
    if (prior) return prior;
    assertStagingKey(
      data.stagingKey,
      ownStagingPrefix(data.actor.organizationId, data.actor.userId),
    );
    const type = await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    /*
      ⚠️ A MISSING EXPIRY NO LONGER REFUSES THE DOCUMENT — deliberately.

      This is the member's OWN path: somebody in a van holding a licence, whose
      photograph the reader could not get a date out of. Refusing it means the
      document is not filed at all, and an unfiled licence is worth strictly
      less than a filed one with a date still to be confirmed.

      The date is not abandoned, it MOVES. A supplied document goes to the
      verification queue where a person is already looking at the image at a
      desk, and `verifyDocument` will not approve a type that has an expiry
      until they supply one. The obligation now sits with whoever can actually
      satisfy it.

      ⚠️ The office path (line ~562) still insists, and should: nothing reviews
      it afterwards, so a date missing there is missing for good.
    */
    const expiresOn = data.expiresOn ? new Date(data.expiresOn) : null;
    if (expiresOn && Number.isNaN(expiresOn.getTime())) {
      throw new BadRequestException('That expiry date could not be read');
    }
    /*
      A date far enough out to be a typo rather than a certificate.

      Deliberately one-sided: an expiry in the PAST is allowed. Somebody
      uploading a lapsed licence alongside its replacement is doing the right
      thing, and the compliance board already reads it as expired — refusing it
      would only mean the office never sees the lapse.
    */
    if (expiresOn && expiresOn.getFullYear() > new Date().getFullYear() + 50) {
      throw new BadRequestException('That expiry date is too far in the future');
    }

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

    const extraPages = (data.pageStagingKeys ?? []).filter(Boolean);
    if (extraPages.length > 0 && data.backStagingKey) {
      throw new BadRequestException('A document is either two-sided or many sheets, not both');
    }
    if (extraPages.length + 1 > MAX_PAGES) {
      throw new BadRequestException(`A document may hold at most ${MAX_PAGES} pages`);
    }

    const filed = await this.storage.takeStagedObject(
      data.actor.organizationId,
      data.stagingKey,
      ownStagingPrefix(data.actor.organizationId, data.actor.userId),
      data.crop,
      data.backStagingKey
        ? { key: data.backStagingKey, crop: data.backCrop ?? null }
        : null,
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
    /*
      A date READ off the document beats one typed into a form.

      The typed date was the weakest link in the chain: nothing checked it, so a
      mistyped year sat on the compliance board as fact. When the zone carries
      an expiry and its check digit agrees, that is the date — and a member who
      typed a different one has just told us something a reviewer should see.
    */
    const scannedExpiry =
      scan?.verdict !== 'SUSPECT' && scan?.extracted.dateOfExpiry
        ? new Date(scan.extracted.dateOfExpiry)
        : null;

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          organizationId: data.actor.organizationId,
          userId: data.actor.userId,
          typeId: type.id,
          title: data.title?.trim() || type.label,
          storageKey: filed.key,
          sha256: filed.hash,
          /*
            The same object, recorded twice on purpose.

            storageKey moves to the sealed copy each time somebody signs;
            originalKey never moves. Re-rendering from the original is what
            keeps a three-party document at one signature block and one
            certificate instead of six appended pages.
          */
          originalKey: filed.key,
          originalSha256: filed.hash,
          sizeBytes: filed.sizeBytes,
          mimeType: filed.mimeType,
          status: 'PENDING_VERIFICATION',
          ...(scan
            ? {
                scanFormat: scan.format,
                scanVerdict: scan.verdict,
                scanData: scan.extracted as object,
                scanChecks: scan.checks as unknown as object,
                holderName: scan.extracted.holderName,
                documentNumber: scan.extracted.documentNumber,
                dateOfBirth: scan.extracted.dateOfBirth ? new Date(scan.extracted.dateOfBirth) : null,
                issuingState: scan.extracted.issuingState,
              }
            : {}),
          // NOT `issuedById`: nobody issued this. The member supplied it, and
          // the trail below is what says so.
          issuedAt,
          expiresOn: scannedExpiry ?? expiresOn,
          retentionUntil: retentionUntil(issuedAt, type.retentionMonths),
        },
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

    await this.notifier.notifySubmitted(
      document.id,
      data.actor.organizationId,
      member,
      type.label,
      document.title,
    );
    // Anything not already settled is read in the background, after this returns.
    if (!document.expiresOn || !scan) this.readQueue?.enqueue(document.id);
    return document;
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
        alreadyFiledBy = `${other.user.firstName} ${other.user.lastName}`.trim();
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
      throw new ForbiddenException(
        `${type.label} is issued by your organization — you cannot upload one yourself`,
      );
    }
    return type;
  }

  /**
   * What a member still owes the organization, and whose turn it is.
   *
   * A separate call rather than a field on the document list, because it is a
   * different question: the list says what somebody HAS, this says what they
   * have not. The compliance board could only ever show the first, which is why
   * the technician who uploaded nothing was invisible on it.
   *
   * Reading your own is free, like the list itself. Reading somebody else's
   * needs the same grant that lets you see their documents exist.
   */
  async listRequirements(data: { actor: DocumentActor; targetUserId?: string }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;

    // 404, not 403: a refusal would confirm the person exists here.
    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Member not found');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: data.actor.organizationId },
      // isExternal: we ask nothing of somebody else's employee — see requirementsFor.
      select: { id: true, memberRoleId: true, isExternal: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: { in: ['SUPPLIED', 'BOTH'] } },
      }),
      this.prisma.document.findMany({
        where: { organizationId: data.actor.organizationId, userId: targetUserId },
        select: { typeId: true, status: true, expiresOn: true },
      }),
    ]);

    // The rule itself is shared and pure — the member's screen, this endpoint
    // and the compliance board all read the same one, so they cannot disagree
    // about whether somebody is covered.
    return requirementStatuses(member, types, held);
  }

  /**
   * Everything personally outstanding, in one answer.
   *
   * The member's own obligations come in two kinds that live in different
   * places — types the organization asks them to SUPPLY, and documents already
   * issued to them that are AWAITING SIGNATURE — and a reminder that only knows
   * about one of them is worse than no reminder, because it reads as a complete
   * statement of what is left.
   *
   * Self only: there is no `targetUserId`. This is the summary behind a badge on
   * somebody's own screen, and an endpoint that will happily summarise a
   * colleague's obligations is an endpoint that leaks who is behind on what.
   *
   * The SAME TWO QUERIES `listRequirements` already makes, so a screen showing
   * both kinds costs exactly what showing one kind cost — `held` is every
   * document the member has, and the ones awaiting a signature were always in
   * it, merely thrown away.
   */
  async pendingForMember(data: { actor: DocumentActor }) {
    const member = await this.prisma.user.findFirst({
      where: { id: data.actor.userId, organizationId: data.actor.organizationId },
      // isExternal: we ask nothing of somebody else's employee — see requirementsFor.
      select: { id: true, memberRoleId: true, isExternal: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: { in: ['SUPPLIED', 'BOTH'] } },
      }),
      this.prisma.document.findMany({
        where: { organizationId: data.actor.organizationId, userId: data.actor.userId },
        select: {
          id: true,
          title: true,
          typeId: true,
          status: true,
          expiresOn: true,
          hiddenFromMember: true,
          // Same reason as the documents list: with a route, AWAITING_SIGNATURE
          // means somebody has to sign, not that THIS person does.
          signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const assigned = await this.routing.documentsWaitingOnMe(data.actor);
    const statuses = requirementStatuses(member, types, held);

    return {
      // Both filtered with the shared rules, so this agrees with the member's
      // own documents screen rather than offering a second opinion.
      toUpload: statuses.filter((r) => waitingOnMember(r)),
      expiring: statuses.filter((r) => r.state === 'EXPIRING'),
      toSign: [
        ...held
          .filter(
            (d) =>
              // A hidden document still counts as held for requirements, but
              // it is never asked of the member it was hidden from.
              !d.hiddenFromMember &&
              d.status === 'AWAITING_SIGNATURE' &&
              ((d.signers ?? []).length === 0 ||
                isCurrentSigner((d.signers ?? []) as unknown as SignerStep[], data.actor.userId)),
          )
          .map((d) => ({ id: d.id, title: d.title, forMember: null as string | null })),
        // Somebody else's, waiting on me. Named, because "Time sheet September"
        // on a manager's list is nine identical rows without the member.
        ...assigned.map((d) => ({
          id: d.id,
          title: d.title,
          forMember: `${d.user.firstName} ${d.user.lastName}`.trim(),
        })),
      ],
    };
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
