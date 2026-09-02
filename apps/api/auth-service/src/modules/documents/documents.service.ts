import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  SERVICE_NAMES,
  periodIsValid,
  retentionUntil,
  memberMayDelete,
  isBlocking,
  canSignInApp,
  credentialStanding,
  renderTemplate,
  missingRequired,
  unknownTokens,
  type DocumentCadence,
  type DocumentDirection,
  type SignatureMode,
  scoreTemplateBinding,
  MERGE_FIELDS,
  documentTypeKey,
  Role,
  buildResolvedAccess,
  accessAllows,
  requirementStatuses,
  waitingOnMember,
  checkScan,
  suggestExpiry,
  type Rect,
  rectToPixels,
  isUsefulCrop,
  parseRoute,
  routeProblem,
  nextPendingStep,
  isCurrentSigner,
  maySignStep,
  signatureStrength,
  acceptedForSigning,
  counterpartySourceFor,
  isUsableEmail,
  isSelfSigning,
  MAX_BATCH_SIGN,
  type SignableDocument,
  chainProgress,
  resolveMemberRouting,
  type DocumentSignerRole,
  type SignerStep,
} from '@hbcfield/shared';
// Node-only: pulls the AWS SDK, so it lives behind its own subpath rather than
// the root export. Services that never touch object storage stay free of it.
import { ObjectStore, documentKey, signatureKey, sha256 } from '@hbcfield/shared/storage';
import { MrzOcrService } from './mrz-ocr.service';
import { renderContractPdf, sealSignedPdf } from './contract-pdf';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OBJECT_STORE } from './object-store.provider';
import { openUntrustedImage } from './image-input';

/**
 * The personnel file.
 *
 * Documents that belong to a PERSON. Two rules run through everything here and
 * are worth stating once rather than repeating at every method:
 *
 *   1. BYTES NEVER PASS THROUGH THIS SERVICE. Uploads and downloads are both
 *      presigned; this service moves metadata and mints short-lived links.
 *
 *   2. EVERY QUERY IS SCOPED IN THE `where` CLAUSE, by organization AND by the
 *      owner. Never fetch-then-filter, never paginate-then-filter. The last
 *      IDOR in this codebase was an endpoint that trusted an id from a path.
 */

/** What a caller is allowed to do, resolved by the gateway from their access. */
export interface DocumentActor {
  userId: string;
  organizationId: string;
  canViewMemberDocuments: boolean;
  canOpenMemberDocuments: boolean;
  canIssueDocuments: boolean;
  canManageDocumentTemplates: boolean;
}

/** Request provenance, recorded on every evidence-trail entry. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Uploads are capped well below anything that would strain a phone or a bill. */
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * What may be filed. Deliberately a short allow-list rather than a deny-list:
 * this store holds employment records, not arbitrary user content, and every
 * type here renders in a viewer without executing anything.
 */
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** One person (or client) a route step could resolve to. */
export interface SignerCandidate {
  /** CONTACT is a space's own client contact — an address with no client row. */
  kind: 'USER' | 'CUSTOMER' | 'CONTACT';
  id: string;
  name: string;
  email: string | null;
}

/** A step of a type's route, with everybody it could resolve to for one member. */
export interface RouteCandidateStep {
  order: number;
  role: DocumentSignerRole;
  candidates: SignerCandidate[];
}

/**
 * Who is holding the pen.
 *
 * A member signs from an authenticated session; a client signs because they
 * hold a link that was emailed to them. The two are not the same claim, and the
 * type keeps them from being written as if they were — `strength` on the
 * certificate follows directly from which branch this is.
 */
type SealSigner =
  | {
      kind: 'user';
      userId: string;
      name: string;
      email: string | null;
      sessionAuthenticatedAt?: Date | null;
    }
  | {
      kind: 'customer';
      /** What they typed. The only identity a link signature has. */
      name: string;
      /** Where the link was sent — the address the signature is attributed to. */
      email: string | null;
      /** The CRM client, when the step resolved to one. Provenance only. */
      customerId?: string | null;
      typedRole?: string | null;
    };

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly ocr: MrzOcrService,
    // Injected, not constructed here — see object-store.provider.ts. Null when
    // no credentials are configured; every path that needs it says so plainly.
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {
    if (!this.store) {
      this.logger.warn('S3 is not configured — document upload and download are unavailable');
    }
  }

  private requireStore(): ObjectStore {
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
  private async withStorage<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(`Storage failed while ${what}: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Document storage is unavailable right now. Nothing was changed — please try again.',
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Document types
  // ══════════════════════════════════════════════════════════════════════════

  async listTypes(data: { organizationId: string; includeInactive?: boolean }) {
    return this.prisma.documentType.findMany({
      where: {
        organizationId: data.organizationId,
        ...(data.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
    });
  }

  async createType(data: {
    actor: DocumentActor;
    key: string;
    label: string;
    description?: string | null;
    cadence?: DocumentCadence;
    direction?: DocumentDirection;
    retentionMonths?: number | null;
    signatureMode?: SignatureMode;
    isCredential?: boolean;
    hasExpiry?: boolean;
    requiredForWorkflowIds?: string[];
    requiredFromAll?: boolean;
    requiredFromRoleIds?: string[];
    twoSided?: boolean;
    scanShape?: string;
    position?: number;
  }) {
    this.assertCanManageTypes(data.actor);

    const key = normaliseKey(data.key);
    if (!key) throw new BadRequestException('A document type needs a key');

    try {
      return await this.prisma.documentType.create({
        data: {
          organizationId: data.actor.organizationId,
          key,
          label: data.label.trim(),
          description: data.description?.trim() || null,
          cadence: data.cadence ?? 'ONE_OFF',
          direction: data.direction ?? 'ISSUED',
          retentionMonths: data.retentionMonths ?? null,
          signatureMode: data.signatureMode ?? 'NONE',
          isCredential: data.isCredential ?? false,
          // A credential without an expiry is legitimate — some qualifications
          // do not lapse — so this is not forced, only defaulted.
          hasExpiry: data.hasExpiry ?? (data.isCredential ?? false),
          requiredForWorkflowIds: data.requiredForWorkflowIds ?? [],
          // Nothing is expected of anybody unless it is said explicitly. Every
          // SUPPLIED type that exists today means "we accept this if you send
          // it", and upgrading must not put a red flag on every member.
          requiredFromAll: data.requiredFromAll ?? false,
          requiredFromRoleIds: data.requiredFromRoleIds ?? [],
          twoSided: data.twoSided ?? false,
          scanShape: data.scanShape ?? 'CARD',
          position: data.position ?? 0,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`A document type with the key "${key}" already exists`);
      }
      throw err;
    }
  }

  async updateType(data: {
    actor: DocumentActor;
    id: string;
    patch: Partial<{
      label: string;
      description: string | null;
      retentionMonths: number | null;
      signatureMode: SignatureMode;
      isCredential: boolean;
      hasExpiry: boolean;
      requiredForWorkflowIds: string[];
      requiredFromAll: boolean;
      requiredFromRoleIds: string[];
      twoSided: boolean;
      scanShape: string;
      isActive: boolean;
      position: number;
      /** Ordered signer roles, or null to go back to a single signature. */
      signerRoute: unknown;
    }>;
  }) {
    this.assertCanManageTypes(data.actor);
    const existing = await this.findTypeOr404(data.id, data.actor.organizationId);

    /*
      A route is validated here rather than trusted.

      It is JSON on a column, so nothing else stops a malformed one being
      stored — and a document type whose route cannot be parsed would issue
      documents with no chain while appearing to have one, which is the worst
      of both. routeProblem returns the reason so the message is written once.
    */
    if (data.patch.signerRoute !== undefined) {
      const problem = routeProblem(data.patch.signerRoute);
      if (problem) throw new BadRequestException(problem);

    }

    // `cadence` and `direction` are absent from the patch on purpose. Changing
    // either would re-interpret every document already filed under the type —
    // a MONTHLY type turned ONE_OFF orphans twelve rows a year from their
    // period, and flipping direction would hand members a delete button for
    // payslips. Make a new type instead.
    return this.prisma.documentType.update({
      where: { id: existing.id },
      data: data.patch as Prisma.DocumentTypeUpdateInput,
    });
  }

  /**
   * Retire a type. Never a hard delete: the documents filed under it must stay
   * readable, and the FK is RESTRICT precisely so this cannot be got around.
   */
  async deactivateType(data: { actor: DocumentActor; id: string }) {
    this.assertCanManageTypes(data.actor);
    const existing = await this.findTypeOr404(data.id, data.actor.organizationId);
    return this.prisma.documentType.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Issuing
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Step one of two: a link the admin's browser can PUT the file to.
   *
   * Nothing is written to the database here. An abandoned upload leaves an
   * orphaned object and no row, which is the right way round — a row pointing
   * at bytes that never arrived would show the member a document that cannot
   * be opened.
   */
  async presignUpload(data: {
    actor: DocumentActor;
    userId: string;
    typeId: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    this.assertCanIssue(data.actor);
    const store = this.requireStore();

    const extension = this.assertUploadable(data.mimeType, data.sizeBytes);

    await this.assertMemberOfOrg(data.userId, data.actor.organizationId);
    await this.findTypeOr404(data.typeId, data.actor.organizationId);

    // A staging key, because the content hash is not known until the bytes
    // exist. `confirmUpload` reads them back, hashes, and moves the object to
    // its content-addressed home.
    const staging = `${data.actor.organizationId}/documents/_staging/${cuidish()}.${extension}`;
    return this.withStorage('preparing an upload', () =>
      store.presignUpload(staging, data.mimeType, data.sizeBytes),
    );
  }

  /**
   * Step two: the bytes are up, so verify and file them.
   *
   * The client says it uploaded; this checks rather than believes it. The
   * object is fetched, hashed, and re-stored under its content address, so the
   * `sha256` on the row is something this service computed — never something a
   * client asserted.
   */
  async confirmUpload(data: {
    /** Chosen signer per route step, where the step had more than one candidate. */
    signerChoices?: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
    actor: DocumentActor;
    stagingKey: string;
    userId: string;
    typeId: string;
    title: string;
    periodYear?: number | null;
    periodMonth?: number | null;
    expiresOn?: string | null;
    /*
      Stage instead of publish.

      A payroll batch confirms thirty files one at a time — the browser drives
      it, so each upload/hash/store round trip is its own small request and a
      failure is isolated to one row. They land as DRAFT: invisible to the
      member, and no notification is sent. `publishBatch` releases them all at
      once, which is the only moment anything becomes visible.

      This is why there is no job queue here. The expensive work is already
      spread across many requests; a queue would only move the same work
      somewhere it is harder to watch.
    */
    asDraft?: boolean;
    ctx?: RequestContext;
  }) {
    this.assertCanIssue(data.actor);
    this.assertStagingKey(data.stagingKey, this.sharedStagingPrefix(data.actor.organizationId));

    const member = await this.assertMemberOfOrg(data.userId, data.actor.organizationId);
    const type = await this.findTypeOr404(data.typeId, data.actor.organizationId);

    if (!periodIsValid(type.cadence, data.periodYear, data.periodMonth)) {
      throw new BadRequestException(
        `A ${type.cadence.toLowerCase().replace('_', '-')} document does not take that period`,
      );
    }
    if (type.hasExpiry && !data.expiresOn) {
      throw new BadRequestException(`${type.label} needs an expiry date`);
    }

    const filed = await this.takeStagedObject(data.actor.organizationId, data.stagingKey);

    const issuedAt = new Date();
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: data.actor.organizationId,
          userId: data.userId,
          typeId: type.id,
          title: data.title.trim() || type.label,
          periodYear: data.periodYear ?? null,
          periodMonth: data.periodMonth ?? null,
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
          status: data.asDraft
            ? 'DRAFT'
            : isBlocking(type.signatureMode)
              ? 'AWAITING_SIGNATURE'
              : 'ISSUED',
          issuedById: data.actor.userId,
          issuedAt,
          expiresOn: data.expiresOn ? new Date(data.expiresOn) : null,
          retentionUntil: retentionUntil(issuedAt, type.retentionMonths),
        },
      });
      /*
        No event for a staged row.

        The trail begins at ISSUED, written by `publishBatch`, because that is
        the moment the document exists for the member. Recording something at
        upload time would either be a lie (ISSUED, when nobody has it) or a
        state with no meaning outside this screen — and an evidence trail whose
        first line is neither of those is not evidence.
      */
      if (!data.asDraft) {
        await tx.documentEvent.create({
          data: {
            documentId: created.id,
            type: 'ISSUED',
            actorId: data.actor.userId,
            ...eventContext(data.ctx),
          },
        });
        // The chain, resolved and frozen in the same transaction as the
        // document. A document that existed without its route would have no way
        // to say whose turn it was.
        await this.createSignerRows(tx, created, type.signerRoute, data.signerChoices);
      }
      return created;
    });

    // Staged documents notify on publish, not on upload.
    if (!data.asDraft) {
      this.notifyIssued(document.id, member, type.label, document.title, isBlocking(type.signatureMode));
    }
    return document;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Contract templates
  // ══════════════════════════════════════════════════════════════════════════

  async listTemplates(data: { actor: DocumentActor; includeInactive?: boolean }) {
    this.assertCanManageTypes(data.actor);
    return this.prisma.documentTemplate.findMany({
      where: {
        organizationId: data.actor.organizationId,
        ...(data.includeInactive ? {} : { isActive: true }),
      },
      include: {
        type: { select: { id: true, label: true } },
        appliesToRole: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createTemplate(data: {
    actor: DocumentActor;
    typeId: string;
    name: string;
    body: string;
    appliesToRoleId?: string | null;
    appliesToPosition?: string | null;
    signatureMode?: SignatureMode;
    offerValidDays?: number | null;
  }) {
    this.assertCanManageTypes(data.actor);
    await this.findTypeOr404(data.typeId, data.actor.organizationId);
    this.assertTemplateBodyIsUsable(data.body);

    return this.prisma.documentTemplate.create({
      data: {
        organizationId: data.actor.organizationId,
        typeId: data.typeId,
        name: data.name.trim(),
        body: data.body,
        appliesToRoleId: data.appliesToRoleId || null,
        appliesToPosition: data.appliesToPosition?.trim() || null,
        signatureMode: data.signatureMode ?? 'IN_APP',
        offerValidDays: data.offerValidDays ?? 14,
      },
    });
  }

  async updateTemplate(data: {
    actor: DocumentActor;
    id: string;
    patch: Partial<{
      name: string;
      body: string;
      appliesToRoleId: string | null;
      appliesToPosition: string | null;
      signatureMode: SignatureMode;
      offerValidDays: number | null;
      isActive: boolean;
    }>;
  }) {
    this.assertCanManageTypes(data.actor);
    const existing = await this.prisma.documentTemplate.findFirst({
      where: { id: data.id, organizationId: data.actor.organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    if (data.patch.body !== undefined) this.assertTemplateBodyIsUsable(data.patch.body);

    /*
      Editing bumps the version, and documents already issued are untouched.

      A contract is rendered ONCE and frozen; the version is what lets somebody
      later ask which wording a particular person actually signed. Re-rendering
      an issued document from an edited template would change its bytes and
      break the hash that proves it has not been altered.
    */
    return this.prisma.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data.patch,
        ...(data.patch.body !== undefined ? { version: existing.version + 1 } : {}),
      },
    });
  }

  async deactivateTemplate(data: { actor: DocumentActor; id: string }) {
    this.assertCanManageTypes(data.actor);
    const existing = await this.prisma.documentTemplate.findFirst({
      where: { id: data.id, organizationId: data.actor.organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.documentTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  /**
   * The template that applies to a role and a job title.
   *
   * Most specific wins: role AND position, then role alone, then position
   * alone, then the organization default. A template bound to nothing is the
   * fallback, so an organization can start with one contract and get more
   * precise later without re-pointing anything.
   */
  async resolveTemplate(data: {
    organizationId: string;
    roleId?: string | null;
    position?: string | null;
  }) {
    const candidates = await this.prisma.documentTemplate.findMany({
      where: { organizationId: data.organizationId, isActive: true },
      include: { type: { select: { id: true, label: true, retentionMonths: true } } },
    });
    if (candidates.length === 0) return null;

    // The scoring lives in the shared package because the admin screen shows
    // who a template will reach BEFORE it is saved. A second copy here would be
    // a screen that promises one contract and an invitation that issues another.
    const person = { memberRoleId: data.roleId ?? null, position: data.position ?? null };

    const best = candidates
      .map((t) => ({ t, s: scoreTemplateBinding(t, person) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)[0];

    return best?.t ?? null;
  }

  /**
   * The template that applies to an existing member, resolved from their record.
   *
   * A thin wrapper over `resolveTemplate` so the invitation flow does not have
   * to know that the answer depends on `memberRoleId` and `position` — if that
   * ever changes, it changes here.
   */
  async resolveTemplateForMember(organizationId: string, userId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { memberRoleId: true, position: true },
    });
    if (!member) return null;
    return this.resolveTemplate({
      organizationId,
      roleId: member.memberRoleId,
      position: member.position,
    });
  }

  /**
   * Render a contract for one member and issue it.
   *
   * RENDER ONCE, HASH, FREEZE. The PDF is produced here, hashed, and stored;
   * it is never regenerated. Re-rendering on view would let a later template
   * edit silently produce a different file, and the hash recorded against the
   * document — the thing that proves it has not been altered — would stop
   * matching for reasons nobody could explain.
   */
  async issueFromTemplate(data: {
    actor: DocumentActor;
    userId: string;
    templateId?: string;
    /** Terms that are not on the member record. */
    contract?: { startDate?: string; weeklyHours?: number | string };
    ctx?: RequestContext;
  }) {
    this.assertCanIssue(data.actor);
    const store = this.requireStore();

    const member = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.actor.organizationId },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        position: true, specialty: true, memberRoleId: true,
        employmentStartDate: true,
        organization: {
          select: {
            name: true, addressLine1: true, city: true, postalCode: true,
            country: true, email: true, phone: true,
          },
        },
      },
    });
    if (!member) throw new NotFoundException('Member not found');

    const template = data.templateId
      ? await this.prisma.documentTemplate.findFirst({
          where: {
            id: data.templateId,
            organizationId: data.actor.organizationId,
            isActive: true,
          },
          include: { type: { select: { id: true, label: true, retentionMonths: true } } },
        })
      : await this.resolveTemplate({
          organizationId: data.actor.organizationId,
          roleId: member.memberRoleId,
          position: member.position,
        });

    if (!template) {
      throw new BadRequestException(
        'No contract template applies to this member. Create one under Document templates.',
      );
    }

    const issuedAt = new Date();
    const values = contractValues(member, data.contract, issuedAt);

    const missing = missingRequired(values);
    if (missing.length > 0) {
      // Refusing beats issuing a contract with a blank where a start date
      // belongs — a document that looks complete and is not.
      throw new BadRequestException(
        `This contract cannot be issued yet — missing: ${missing.join(', ')}`,
      );
    }

    const { text, missing: unfilled } = renderTemplate(template.body, values);
    if (unfilled.length > 0) {
      throw new BadRequestException(`Template fields have no value: ${unfilled.join(', ')}`);
    }

    const title = `${template.type.label} — ${member.firstName} ${member.lastName}`.trim();
    const pdf = await renderContractPdf({
      title: template.type.label,
      body: text,
      issuedAt,
      organizationName: member.organization?.name ?? '',
      memberName: `${member.firstName} ${member.lastName}`.trim(),
    });

    const hash = sha256(pdf);
    const key = documentKey(data.actor.organizationId, hash, 'pdf');
    await this.withStorage('storing a contract', () => store.put(key, pdf, 'application/pdf'));

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: data.actor.organizationId,
          userId: member.id,
          typeId: template.typeId,
          templateId: template.id,
          title,
          storageKey: key,
          sha256: hash,
          // The contract as rendered, before anybody signs it — see confirmUpload.
          originalKey: key,
          originalSha256: hash,
          sizeBytes: pdf.length,
          mimeType: 'application/pdf',
          status: isBlocking(template.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
          issuedById: data.actor.userId,
          issuedAt,
          retentionUntil: retentionUntil(issuedAt, template.type.retentionMonths),
        },
      });
      await tx.documentEvent.create({
        data: {
          documentId: created.id,
          type: 'ISSUED',
          actorId: data.actor.userId,
          meta: { templateId: template.id, templateVersion: template.version },
          ...eventContext(data.ctx),
        },
      });
      return created;
    });

    this.notifyIssued(
      document.id,
      member,
      template.type.label,
      title,
      isBlocking(template.signatureMode),
    );
    return document;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Signing
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * The contract as a PDF, before anybody is bound by it.
   *
   * The editor's on-screen preview is text in a box: right words, wrong
   * typography, no pagination, no idea where the page breaks fall. What a
   * member actually receives is a PDF, and the only way to know a clause has
   * not been orphaned at the foot of page two is to look at the PDF.
   *
   * So this renders through the SAME `renderContractPdf` that issuing uses.
   * A preview produced by a second, friendlier renderer would be a picture of
   * a document nobody will ever be sent.
   *
   * Nothing is stored and no event is written — this is a look, not an issue.
   * Values that a real member has not got (no start date on the record yet) are
   * left as an em dash and reported back, so the hole is visible in the page
   * AND named in the editor rather than discovered at issue time.
   */
  async previewTemplate(data: {
    actor: DocumentActor;
    /** Omit to ask only for the values — the editor does this once per member. */
    body?: string;
    title?: string;
    memberId?: string;
  }): Promise<{
    pdf: string | null;
    values: Record<string, string>;
    filledFor: string | null;
    missing: string[];
  }> {
    this.assertCanManageTypes(data.actor);

    const select = {
      id: true, firstName: true, lastName: true, email: true,
      position: true, specialty: true, memberRoleId: true,
      employmentStartDate: true,
      organization: {
        select: {
          name: true, addressLine1: true, city: true, postalCode: true,
          country: true, email: true, phone: true,
        },
      },
    } as const;

    // The member the editor is previewing for, or anyone — an organization with
    // no members yet still deserves to see its own contract laid out.
    const member =
      (data.memberId
        ? await this.prisma.user.findFirst({
            where: { id: data.memberId, organizationId: data.actor.organizationId },
            select,
          })
        : null) ??
      (await this.prisma.user.findFirst({
        where: { organizationId: data.actor.organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select,
      }));

    const issuedAt = new Date();
    const resolved = member
      ? contractValues(member, undefined, issuedAt)
      : { 'contract.issuedOn': isoDate(issuedAt) };

    /*
      An em dash for anything the record has not got, and the values go back to
      the editor as well as into the page.

      The screen used to invent them — today's date for a start date, "Your
      company" for the company — so its instant text preview and the PDF quietly
      disagreed about the same contract. One resolver, used by both, is the only
      way those two can agree; and it is the same resolver issuing uses, so what
      the editor shows is what the member gets.
    */
    const values: Record<string, string> = {};
    for (const field of MERGE_FIELDS) {
      const v = resolved[field.token];
      values[field.token] = v === null || v === undefined || v === '' ? '—' : String(v);
    }

    const memberName = member ? `${member.firstName} ${member.lastName}`.trim() : '';

    if (!data.body?.trim()) {
      // Values only. The editor asks for these once per member and renders its
      // live text preview from them without troubling the server per keystroke.
      return { pdf: null, values, filledFor: memberName || null, missing: [] };
    }

    const { missing } = renderTemplate(data.body, resolved);
    const { text } = renderTemplate(data.body, values);

    try {
      const pdf = await renderContractPdf({
        title: data.title?.trim() || 'Contract',
        body: text,
        issuedAt,
        organizationName: member?.organization?.name ?? '',
        memberName,
      });
      return { pdf: pdf.toString('base64'), values, filledFor: memberName || null, missing };
    } catch (error) {
      /*
        The renderer refuses text its font cannot draw, rather than printing
        black squares into a legal document. Here — in the editor, before
        anything is issued — that refusal is exactly the feedback the author
        needs, so it becomes a 400 carrying the offending characters.
      */
      const message = error instanceof Error ? error.message : 'The preview could not be rendered';
      throw new BadRequestException(message);
    }
  }

  /**
   * The two questions every upload has to answer before a byte moves.
   *
   * Shared by the administrator's path and the member's, because a limit that
   * only one of them honours is not a limit. Returns the extension so the
   * caller does not look it up a second time.
   */
  private assertUploadable(mimeType: string, sizeBytes: number): string {
    const extension = ALLOWED_MIME[mimeType];
    if (!extension) {
      throw new BadRequestException(`${mimeType} cannot be filed. Accepted: PDF, PNG, JPEG.`);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('A file size is required');
    }
    if (sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(
        `That file is larger than the ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`,
      );
    }
    return extension;
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
  private async takeStagedObject(
    organizationId: string,
    stagingKey: string,
    expectedPrefix?: string,
    crop?: Rect | null,
    back?: { key: string; crop: Rect | null } | null,
  ): Promise<{ key: string; hash: string; sizeBytes: number; mimeType: string; bytes: Buffer }> {
    // Checked again here, not only by the caller. This method reads and moves
    // an object named by untrusted input, so it does not rely on having been
    // called correctly.
    this.assertStagingKey(stagingKey, expectedPrefix ?? this.sharedStagingPrefix(organizationId));

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
    if (back) {
      // The reverse comes from the client too, so it gets the same check.
      this.assertStagingKey(back.key, expectedPrefix ?? this.sharedStagingPrefix(organizationId));
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

  // ══════════════════════════════════════════════════════════════════════════
  // What the member supplies themselves
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * A member's own staging folder.
   *
   * Per-user, not per-organization. The administrator's prefix is shared by
   * everyone who can issue, which is fine because they may file to anybody;
   * a member may file only to themselves, so their confirm step must be unable
   * to name an object anybody else staged.
   */
  private ownStagingPrefix(organizationId: string, userId: string): string {
    return `${organizationId}/documents/_staging/u/${userId}/`;
  }

  /** Where anyone who may issue stages a file, for anybody in the organization. */
  private sharedStagingPrefix(organizationId: string): string {
    return `${organizationId}/documents/_staging/`;
  }

  /**
   * The staging key came back from the client, so it is untrusted input, and it
   * is the one place a caller could try to name somebody else's object.
   *
   * Called FIRST by both confirm paths, before the member and the type are
   * looked up. The ordering is the point: a caller probing keys gets the same
   * refusal either way, rather than learning from a 404 which member ids and
   * type ids exist. It also means a misconfigured store cannot turn this
   * refusal into a different error.
   */
  private assertStagingKey(stagingKey: string, prefix: string) {
    if (!stagingKey.startsWith(prefix) || stagingKey.includes('..')) {
      throw new ForbiddenException('That upload does not belong to you');
    }
  }

  /**
   * Step one, for the member: a link their own device can PUT the file to.
   *
   * NO PERMISSION IS CHECKED, and none ever will be. Supplying your own driving
   * licence is not an administrative act — it is the only way the organization
   * can get a document that only you possess. What is checked instead is the
   * TYPE: a member may upload against a SUPPLIED type and nothing else, so this
   * can never become a way to file yourself a payslip.
   */
  async presignOwnUpload(data: {
    actor: DocumentActor;
    typeId: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const store = this.requireStore();
    const extension = this.assertUploadable(data.mimeType, data.sizeBytes);
    await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    const staging =
      `${this.ownStagingPrefix(data.actor.organizationId, data.actor.userId)}${cuidish()}.${extension}`;
    return this.withStorage('preparing an upload', () =>
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
    backCrop?: Rect | null;
    ctx?: RequestContext;
  }) {
    this.assertStagingKey(
      data.stagingKey,
      this.ownStagingPrefix(data.actor.organizationId, data.actor.userId),
    );
    const type = await this.assertMemberSuppliableType(data.typeId, data.actor.organizationId);

    if (type.hasExpiry && !data.expiresOn) {
      throw new BadRequestException(`${type.label} needs an expiry date`);
    }
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
      // No dateOfBirth: the User model does not hold one. `checkScan` then
      // only asks whether the date on the document is plausible for a working
      // person, which is the honest limit of what can be compared.
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const filed = await this.takeStagedObject(
      data.actor.organizationId,
      data.stagingKey,
      this.ownStagingPrefix(data.actor.organizationId, data.actor.userId),
      data.crop,
      data.backStagingKey
        ? { key: data.backStagingKey, crop: data.backCrop ?? null }
        : null,
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
    const mrzText =
      data.mrzText?.trim() || (await this.ocr.read(filed.bytes, filed.mimeType));

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

    await this.notifySubmitted(
      document.id,
      data.actor.organizationId,
      member,
      type.label,
      document.title,
    );
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
    member: { id: string; firstName: string; lastName: string },
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
  private async composeSides(front: Buffer, back: Buffer | null): Promise<Buffer> {
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
  private async peekStaged(
    organizationId: string,
    stagingKey: string,
    userId: string,
    crop?: Rect | null,
  ): Promise<Buffer> {
    this.assertStagingKey(stagingKey, this.ownStagingPrefix(organizationId, userId));
    const store = this.requireStore();
    const head = await this.withStorage('checking an upload', () => store.head(stagingKey));
    if (!head.exists) {
      throw new BadRequestException('The upload did not complete — please try again');
    }
    const raw = await this.withStorage('reading an upload', () => store.get(stagingKey));
    return this.applyCrop(raw, crop);
  }

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
    const front = await this.peekStaged(organizationId, data.stagingKey, userId, data.crop);
    const back = data.backStagingKey
      ? await this.peekStaged(organizationId, data.backStagingKey, userId, data.backCrop)
      : null;

    // Read the two sides together. On an ID card the zone is only on the back.
    const bytes = await this.composeSides(front, back);
    const text = await this.ocr.read(bytes, 'image/jpeg');

    if (!text) {
      return { source: 'NOTHING' as const, expiresOn: null, fields: null, verdict: null };
    }

    const member = await this.assertMemberOfOrg(data.actor.userId, data.actor.organizationId);
    const scan = checkScan({ mrzText: text, member });

    if (scan.raw) {
      /*
        A zone was read. The expiry is only offered when the arithmetic agrees:
        a failed check digit means the read is wrong OR the document is, and
        pre-filling a field from either would be putting a wrong date in front
        of somebody with the app's authority behind it.
      */
      return {
        source: 'MRZ' as const,
        expiresOn: scan.raw.allChecksPassed ? scan.extracted.dateOfExpiry : null,
        fields: {
          holderName: scan.extracted.holderName,
          documentNumber: scan.extracted.documentNumber,
          dateOfBirth: scan.extracted.dateOfBirth,
          issuingState: scan.extracted.issuingState,
        },
        verdict: scan.verdict,
      };
    }

    // No zone: a licence or a certificate. The best that can be done is the
    // latest date printed on it, clearly labelled as a guess.
    const guess = suggestExpiry(text);
    return {
      source: guess ? ('TEXT' as const) : ('NOTHING' as const),
      expiresOn: guess?.iso ?? null,
      fields: null,
      verdict: null,
    };
  }

  /**
   * The type must exist, be in use, and be one the member is allowed to supply.
   *
   * Direction is the whole rule and it is enforced on the server every time,
   * not by which types the screen chose to offer.
   */
  private async assertMemberSuppliableType(typeId: string, organizationId: string) {
    const type = await this.findTypeOr404(typeId, organizationId);
    if (!type.isActive) {
      throw new BadRequestException('That document type is no longer in use');
    }
    if (type.direction !== 'SUPPLIED') {
      throw new ForbiddenException(
        `${type.label} is issued by your organization — you cannot upload one yourself`,
      );
    }
    return type;
  }

  /**
   * Tell whoever reviews documents that one is waiting.
   *
   * Fire-and-forget, like every other notification here: an upload that
   * succeeded must not be undone because a queue was down. The document is in
   * the review list either way, which is the durable half.
   */
  private async notifySubmitted(
    documentId: string,
    organizationId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    title: string,
  ) {
    try {
      /*
        The recipients are resolved HERE, not in the notification service.

        Same shape as the credential reminders: the producer owns the database
        and the permission model, so the handler stays a delivery mechanism
        rather than growing a second copy of "who is allowed to review".
      */
      const candidates = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          // Narrowed in SQL to the people who could plausibly hold it — the
          // owner, or anybody with a member role at all — so the resolve below
          // runs over a handful of rows rather than the whole company.
          OR: [{ role: Role.ADMIN }, { memberRoleId: { not: null } }],
        },
        select: {
          id: true,
          role: true,
          canCreateTasks: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
          canViewReports: true,
          memberRole: { select: { permissions: true } },
        },
      });

      /*
        `canIssueDocuments` is NOT a column.

        It lives in the unified access model — a member role's permissions JSON,
        merged over the legacy user flags — so it cannot be filtered in SQL, and
        an approximation like `canManageUsers: true` would silently miss anybody
        granted the document permission on its own. Resolved with the same
        helper the request path uses, so this list and the guard agree.
      */
      const reviewers = candidates.filter((u) =>
        accessAllows(
          buildResolvedAccess({
            // Same rule as the request path: an admin holds every permission by
            // being an admin, so an admin is always a valid reviewer even when
            // their assigned role does not list the document keys.
            isAdmin: u.role === 'ADMIN',
            userFlags: u,
            memberRolePermissions: u.memberRole?.permissions,
          }),
          'canIssueDocuments',
        ),
      );

      this.notificationClient.emit('document_submitted', {
        documentId,
        organizationId,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        typeLabel,
        title,
        // Deduplicated by the handler; a reviewer uploading their own
        // certificate should not be told about it.
        recipientIds: reviewers.map((r) => r.id),
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue submission notice for document ${documentId}: ${(err as Error).message}`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Reviewing what members supplied
  // ══════════════════════════════════════════════════════════════════════════

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

    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: data.actor.organizationId },
      select: { id: true, memberRoleId: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: 'SUPPLIED' },
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
      select: { id: true, memberRoleId: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [types, held] = await Promise.all([
      this.prisma.documentType.findMany({
        where: { organizationId: data.actor.organizationId, isActive: true, direction: 'SUPPLIED' },
      }),
      this.prisma.document.findMany({
        where: { organizationId: data.actor.organizationId, userId: data.actor.userId },
        select: {
          id: true,
          title: true,
          typeId: true,
          status: true,
          expiresOn: true,
          // Same reason as the documents list: with a route, AWAITING_SIGNATURE
          // means somebody has to sign, not that THIS person does.
          signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const assigned = await this.documentsWaitingOnMe(data.actor);
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
   * Everything waiting for somebody to look at it.
   *
   * The whole queue in one query, oldest first — a person waiting on a licence
   * being approved is blocked from work, so the oldest is the most urgent. It
   * carries no URLs: opening the file is a separate, recorded act.
   */
  async listAwaitingVerification(data: { actor: DocumentActor }) {
    this.assertCanIssue(data.actor);

    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: data.actor.organizationId,
        status: 'PENDING_VERIFICATION',
      },
      select: {
        id: true,
        title: true,
        issuedAt: true,
        expiresOn: true,
        sizeBytes: true,
        mimeType: true,
        scanFormat: true,
        scanVerdict: true,
        scanChecks: true,
        holderName: true,
        documentNumber: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        type: {
          select: { id: true, label: true, isCredential: true, requiredForWorkflowIds: true },
        },
      },
      // Indexed on [organizationId, status].
      orderBy: { issuedAt: 'asc' },
      take: 500,
    });

    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      submittedAt: r.issuedAt,
      expiresOn: r.expiresOn,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
      member: r.user,
      typeId: r.type.id,
      typeLabel: r.type.label,
      isCredential: r.type.isCredential,
      /*
        Whether somebody is WAITING ON THIS to be able to work.

        A licence that gates a task type means this person is out of the pool
        until it is approved — that is a queue item with a cost attached, and it
        should not look like a filing task.
      */
      blocksWork: r.type.requiredForWorkflowIds.length > 0,
      /*
        What the machine made of it, if it was scanned.

        First thing in the row, because it changes what the reviewer is doing:
        CONSISTENT means "confirm this looks like the person"; SUSPECT means
        "here is a specific thing that is wrong". Without it they are squinting
        at a photograph for a changed digit.
      */
      scanFormat: r.scanFormat,
      scanVerdict: r.scanVerdict,
      scanChecks: r.scanChecks,
      holderName: r.holderName,
      documentNumber: r.documentNumber,
      // Approving an already-lapsed certificate would put a green tick on
      // something the gate will still refuse. The reviewer needs to see that.
      standing: r.type.isCredential ? credentialStanding(r.expiresOn, now) : null,
    }));
  }

  /**
   * Accept it. This is the moment it starts counting.
   *
   * The status becomes ISSUED, and that is deliberately the ONLY thing the
   * dispatch gate reads. `verifiedAt` is recorded as an audit fact rather than
   * as a second condition, because a gate that had to check both would be one
   * `AND verifiedAt IS NOT NULL` away from silently failing open — and every
   * administrator-filed document would need a verification it never had.
   */
  async verifyDocument(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    this.assertCanIssue(data.actor);
    const document = await this.findPendingOr404(data.actor, data.documentId);

    const verifiedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id: document.id },
        data: {
          // A supplied document with a signature mode still has to be signed —
          // approving it decides only that the file is genuine.
          status: isBlocking(document.type.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
          verifiedAt,
          verifiedById: data.actor.userId,
          // Cleared, so a resubmission that is approved does not keep showing
          // the reason an earlier one was refused.
          rejectionReason: null,
        },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'VERIFIED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
      return row;
    });

    this.notifyReviewed(document.id, document.user, document.type.label, true, null);
    return updated;
  }

  /**
   * Refuse it, with a reason the member will read.
   *
   * The reason is REQUIRED. "Rejected" on its own is an instruction to upload
   * the same photograph again, and the second attempt fails for the reason
   * nobody gave — which is how a member ends up unable to work over a blurred
   * corner.
   */
  async rejectDocument(data: {
    actor: DocumentActor;
    documentId: string;
    reason: string;
    ctx?: RequestContext;
  }) {
    this.assertCanIssue(data.actor);

    const reason = data.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Say why it was not accepted — the member sees this');
    }

    const document = await this.findPendingOr404(data.actor, data.documentId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.document.update({
        where: { id: document.id },
        data: { status: 'REJECTED', rejectionReason: reason },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'REJECTED',
          actorId: data.actor.userId,
          meta: { reason },
          ...eventContext(data.ctx),
        },
      });
      return row;
    });

    this.notifyReviewed(document.id, document.user, document.type.label, false, reason);
    return updated;
  }

  /**
   * A document this caller may review, or a refusal.
   *
   * PENDING_VERIFICATION only. Re-approving something already ISSUED would
   * rewrite `verifiedAt` on a document nobody re-examined, and "rejecting" a
   * payslip the organization issued is not a review — it is a way to make a
   * record disappear from the member's list.
   */
  private async findPendingOr404(actor: DocumentActor, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
        status: 'PENDING_VERIFICATION',
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { label: true, signatureMode: true } },
      },
    });
    if (!document) throw new NotFoundException('No document is waiting for review');
    return document;
  }

  /** Tell the member what happened to what they sent. */
  private notifyReviewed(
    documentId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    accepted: boolean,
    reason: string | null,
  ) {
    try {
      this.notificationClient.emit('document_reviewed', {
        documentId,
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        typeLabel,
        accepted,
        // Carried into the message itself: a refusal the member has to open the
        // app to understand is a refusal they act on a day later.
        reason,
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue review notice for document ${documentId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Record that the member agreed to sign electronically.
   *
   * Its own act, and its own event, deliberately separate from the signature.
   * eIDAS treats consent to the electronic form as a distinct thing from the
   * signature itself, and a trail that conflates them cannot show that the
   * signer was told what they were doing before they did it.
   */
  async recordConsent(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    const document = await this.findSignableOr404(data.actor, data.documentId);
    await this.prisma.documentEvent.create({
      data: {
        documentId: document.id,
        type: 'CONSENTED',
        actorId: data.actor.userId,
        meta: { text: CONSENT_TEXT },
        ...eventContext(data.ctx),
      },
    });
    return { consentText: CONSENT_TEXT, consentAt: new Date() };
  }

  /**
   * Sign a document, seal it, and freeze it.
   *
   * Idempotent by key: a dropped connection on a phone in a plant room must
   * return the existing seal, never sign a second time. Everything after the
   * signature is made runs in one transaction.
   */
  async signDocument(data: {
    actor: DocumentActor;
    documentId: string;
    /** PNG data URL from the signature pad. */
    signatureImage: string;
    idempotencyKey: string;
    sessionAuthenticatedAt?: string | null;
    ctx?: RequestContext;
  }) {
    if (!data.idempotencyKey || data.idempotencyKey.length < 8) {
      throw new BadRequestException('A signing request needs an idempotency key');
    }

    // Answered before anything else: this is the retry path, and it must be
    // cheap and side-effect free.
    const existing = await this.prisma.documentSignature.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: { document: { select: { id: true, organizationId: true, status: true } } },
    });
    if (existing) {
      if (existing.document.organizationId !== data.actor.organizationId) {
        throw new ForbiddenException('That signature does not belong to your organization');
      }
      return { documentId: existing.documentId, alreadySigned: true, sealedAt: existing.sealedAt };
    }

    /*
      Authorization first, storage second — the same ordering getDownloadUrl
      states and this path did not follow. With it reversed, somebody signing
      out of turn was told "storage is not configured" instead of being told
      whose turn it is, and a misconfigured server answered the wrong question
      to every caller.
    */
    const document = await this.findSignableOr404(data.actor, data.documentId);
    const store = this.requireStore();

    if (!canSignInApp(document.type.signatureMode)) {
      // WET_INK exists for contract types the law excludes from electronic
      // form. Refusing is the whole point: producing something that looks
      // signed and is not would be worse than not offering it.
      throw new BadRequestException(
        document.type.signatureMode === 'WET_INK'
          ? 'This document must be signed on paper.'
          : 'This document does not take a signature.',
      );
    }

    const png = decodeSignaturePng(data.signatureImage);
    const signatureHash = sha256(png);
    const sigKey = signatureKey(data.actor.organizationId, signatureHash);
    await this.withStorage('storing the signature', () => store.put(sigKey, png, 'image/png'));

    // The person signing NOW. Not document.user — that is who the document is
    // ABOUT, and from step two onwards they are not the one holding the pen.
    const signerUser = await this.prisma.user.findFirst({
      where: { id: data.actor.userId, organizationId: data.actor.organizationId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!signerUser) throw new NotFoundException('Signer not found');

    /*
      Whose step this was, and whether it was the last.

      Read before the seal so the status written inside it is decided from the
      chain rather than assumed. A document with no route has no steps and
      finishes on its only signature, exactly as it always did.
    */
    const steps = await this.signerSteps(document.id);
    const currentStep = nextPendingStep(steps);
    const isLastStep =
      steps.length === 0 ||
      chainProgress(
        steps.map((s) =>
          s.order === currentStep?.order ? { ...s, status: 'SIGNED' as const } : s,
        ),
      ).complete;
    const signerRow = currentStep
      ? await this.prisma.documentSigner.findFirst({
          where: { documentId: document.id, order: currentStep.order },
          select: { id: true },
        })
      : null;

    const sealed = await this.sealAndRecord({
      document,
      organizationId: data.actor.organizationId,
      signer: {
        kind: 'user',
        userId: data.actor.userId,
        name: `${signerUser.firstName} ${signerUser.lastName}`.trim(),
        email: signerUser.email,
        sessionAuthenticatedAt: data.sessionAuthenticatedAt
          ? new Date(data.sessionAuthenticatedAt)
          : null,
      },
      png,
      signatureHash,
      sigKey,
      currentStep,
      signerRowId: signerRow?.id ?? null,
      isLastStep,
      idempotencyKey: data.idempotencyKey,
      ctx: data.ctx,
    });

    /*
      Hand the document on.

      AFTER the seal commits, never inside it: telling somebody a document is
      waiting for them and then rolling back the signature that made it their
      turn is worse than not telling them.

      A failure here does not undo the step. The chain has genuinely advanced
      and the register shows it waiting on the right person — a stalled chain
      that LOOKS moved is the dangerous version, not one that moved quietly.
    */
    if (!isLastStep) {
      await this.notifyNextSigner(document.id, document.title);
    }

    return { documentId: document.id, alreadySigned: false, sealedAt: sealed.sealedAt };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // The client, signing by emailed link
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Everything this client is waiting on, and everything they have signed.
   *
   * Scoped entirely by the resolved link — no id is ever taken from the
   * request. A client's own signer rows are the whole authorization: being
   * named as the signer of a step is what entitles somebody to that document,
   * and to nothing else.
   *
   * Only steps whose TURN it is appear under "to sign". A document three
   * signatures away is not theirs yet, and listing it would invite a
   * countersignature on work their supplier has not finished approving.
   */
  async listForCustomer(data: { organizationId: string; email: string }) {
    const rows = await this.prisma.documentSigner.findMany({
      where: {
        // Addressed to THIS address — not to a client record. Two of the three
        // kinds of counterparty have no record to scope by, and the address is
        // frozen onto the row at issue so a client changing theirs tomorrow
        // cannot redirect a document already in flight.
        email: data.email,
        document: {
          organizationId: data.organizationId,
          status: { in: ['AWAITING_SIGNATURE', 'SIGNED'] },
        },
      },
      select: {
        id: true,
        order: true,
        status: true,
        openedAt: true,
        document: {
          select: {
            id: true,
            title: true,
            periodYear: true,
            periodMonth: true,
            user: { select: { firstName: true, lastName: true } },
            // The whole chain, so "whose turn is it" is decided from data
            // already in hand rather than a second query per document.
            signers: {
              select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true, signedAt: true },
            },
            signatures: {
              orderBy: { signedAt: 'asc' },
              select: {
                signedAt: true,
                signerName: true,
                user: { select: { firstName: true, lastName: true } },
                signer: { select: { role: true } },
              },
            },
          },
        },
      },
      orderBy: { document: { issuedAt: 'asc' } },
      // A bound, not pagination. A client with more than this waiting has a
      // process problem a longer list would not solve.
      take: 200,
    });

    const shape = (r: (typeof rows)[number]): SignableDocument => ({
      documentId: r.document.id,
      signerId: r.id,
      title: r.document.title,
      forMember: r.document.user
        ? `${r.document.user.firstName} ${r.document.user.lastName}`.trim()
        : null,
      periodYear: r.document.periodYear,
      periodMonth: r.document.periodMonth,
      alreadySigned: r.document.signatures.map((s) => ({
        name: s.signerName ?? (s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : ''),
        role: roleLabel(s.signer?.role ?? null),
        signedAt: s.signedAt.toISOString(),
      })),
      openedAt: r.openedAt ? r.openedAt.toISOString() : null,
    });

    const toSign = rows
      .filter((r) => {
        if (r.status !== 'PENDING') return false;
        const next = nextPendingStep(r.document.signers as unknown as SignerStep[]);
        return next?.order === r.order;
      })
      .map(shape);

    const signed = rows.filter((r) => r.status === 'SIGNED').map(shape);
    return { toSign, signed };
  }

  /**
   * A URL for one document the client may see, and a record that they saw it.
   *
   * `openedAt` is evidence, not a gate. Requiring somebody to open ten
   * identical time sheets buys clicking-through, which is a worse signature
   * than the honest one — so this records the truth and the certificate reports
   * it, instead of enforcing a fiction.
   */
  async openForCustomer(data: { organizationId: string; email: string; signerId: string }) {
    const row = await this.prisma.documentSigner.findFirst({
      where: {
        id: data.signerId,
        email: data.email,
        document: { organizationId: data.organizationId },
      },
      select: {
        id: true,
        openedAt: true,
        document: { select: { id: true, storageKey: true, title: true, mimeType: true } },
      },
    });
    if (!row) throw new NotFoundException('Document not found');

    const store = this.requireStore();
    const url = await this.withStorage('opening the document', () =>
      store.presignDownload(
        row.document.storageKey,
        downloadName(row.document.title, row.document.mimeType),
        undefined,
        { inline: canRenderInline(row.document.mimeType), contentType: row.document.mimeType },
      ),
    );

    if (!row.openedAt) {
      await this.prisma.documentSigner.update({
        where: { id: row.id },
        data: { openedAt: new Date() },
      });
      // No actorId: a client has no user row, and putting a member's id here
      // would be a false entry on an append-only evidence trail.
      await this.prisma.documentEvent.create({
        data: { documentId: row.document.id, type: 'OPENED', meta: { byLink: true } },
      });
    }
    return { url };
  }

  /**
   * One ceremony, many documents.
   *
   * A client with eleven time sheets signs once. What is shared is the ACT —
   * the drawing, the consent, the sitting — and nothing else: each document
   * gets its own signature row, its own hash chain and its own certificate,
   * exactly as if it had been signed alone. Anything else would make one
   * document's evidence depend on which others it was batched with.
   *
   * Four things here are deliberate.
   *
   * The selection is intersected with what is pending RIGHT NOW, because the
   * page the client is looking at may be hours old and a document may have been
   * sent back or revoked since it was drawn.
   *
   * The signature image is stored ONCE — keys are content-addressed, so one
   * drawing across eleven documents is one object and eleven references.
   *
   * Each document gets its own idempotency key derived from the batch id. One
   * shared key would hand every document after the first the FIRST one's
   * result, which is exactly how a batch silently signs one document and
   * reports eleven.
   *
   * And a failure part-way does not throw. Each seal is its own transaction, so
   * ten successful signatures are ten real signatures whatever happens to the
   * eleventh; reporting total failure would tell the client none of it took
   * when most of it did.
   */
  async signBatchAsCustomer(data: {
    organizationId: string;
    email: string;
    signerIds: string[];
    signatureImage: string;
    typedName: string;
    typedRole?: string | null;
    idempotencyKey: string;
    ctx?: RequestContext;
  }) {
    const typedName = (data.typedName ?? '').trim();
    if (typedName.length < 2) throw new BadRequestException('Please enter your name.');
    if (!Array.isArray(data.signerIds) || data.signerIds.length === 0) {
      throw new BadRequestException('Choose at least one document to sign.');
    }
    if (data.signerIds.length > MAX_BATCH_SIGN) {
      throw new BadRequestException(`You can sign at most ${MAX_BATCH_SIGN} documents at once.`);
    }
    if ((data.idempotencyKey ?? '').length < 8) {
      throw new BadRequestException('idempotencyKey must be at least 8 characters');
    }

    const { toSign } = await this.listForCustomer(data);
    const accepted = acceptedForSigning(data.signerIds, toSign);
    if (accepted.length === 0) {
      throw new BadRequestException('Those documents are no longer waiting for your signature.');
    }

    const store = this.requireStore();
    const png = decodeSignaturePng(data.signatureImage);
    const signatureHash = sha256(png);
    const sigKey = signatureKey(data.organizationId, signatureHash);
    await this.withStorage('storing the signature', () => store.put(sigKey, png, 'image/png'));

    const batchId = data.idempotencyKey;
    const signer: SealSigner = {
      kind: 'customer',
      name: typedName,
      email: data.email,
      typedRole: data.typedRole?.trim() || null,
    };

    const signed: string[] = [];
    const failed: { documentId: string; reason: string }[] = [];

    for (const signerId of accepted) {
      const row = toSign.find((d) => d.signerId === signerId);
      if (!row) continue;
      try {
        const document = await this.prisma.document.findFirst({
          where: { id: row.documentId, organizationId: data.organizationId },
          select: {
            id: true,
            title: true,
            storageKey: true,
            sha256: true,
            originalKey: true,
            organization: { select: { name: true } },
          },
        });
        if (!document) continue;

        // Re-read the chain per document. The list said it was their turn; this
        // says so at the moment of signing, which is the one that counts.
        const steps = await this.signerSteps(document.id);
        const currentStep = nextPendingStep(steps);
        /*
          The row we are about to sign must STILL be the current step.

          The list said so when it was drawn; this says so at the moment of
          signing, which is the one that counts — a document could have been
          sent back in between, and signing a superseded step would attach a
          countersignature to a version its supplier has withdrawn.
        */
        const mine = await this.prisma.documentSigner.findFirst({
          where: { id: signerId, documentId: document.id, status: 'PENDING' },
          select: { order: true },
        });
        if (!currentStep || !mine || currentStep.order !== mine.order) continue;

        const isLastStep = chainProgress(
          steps.map((s) =>
            s.order === currentStep.order ? { ...s, status: 'SIGNED' as const } : s,
          ),
        ).complete;

        await this.sealAndRecord({
          document,
          organizationId: data.organizationId,
          signer,
          png,
          signatureHash,
          sigKey,
          currentStep,
          signerRowId: signerId,
          isLastStep,
          idempotencyKey: `${batchId}:${document.id}`,
          ctx: data.ctx,
          batchId,
        });
        signed.push(document.id);

        if (!isLastStep) await this.notifyNextSigner(document.id, document.title);
      } catch (err) {
        failed.push({ documentId: row.documentId, reason: (err as Error).message });
        this.logger.warn(`Batch sign failed for ${row.documentId}: ${(err as Error).message}`);
      }
    }

    return { signed: signed.length, failed, batchId };
  }

  /**
   * Attach one signature to one document, re-seal it, and record the act.
   *
   * Extracted from `signDocument` so a CLIENT signing eleven time sheets in one
   * sitting walks exactly the same path eleven times instead of a second copy
   * of it. The two callers differ only in WHO is signing — everything that
   * makes a signature evidence (the tamper gate, the chain of hashes, the
   * re-render from the original, the events) is here and is the same for both.
   *
   * The signature PNG is deliberately NOT uploaded here. Keys are
   * content-addressed, so one drawing applied to eleven documents is one object
   * — the caller stores it once and passes the key in.
   */
  private async sealAndRecord(params: {
    document: {
      id: string;
      title: string;
      storageKey: string;
      sha256: string;
      originalKey: string | null;
      organization?: { name: string } | null;
    };
    organizationId: string;
    signer: SealSigner;
    png: Buffer;
    signatureHash: string;
    sigKey: string;
    currentStep: SignerStep | null;
    signerRowId: string | null;
    isLastStep: boolean;
    idempotencyKey: string;
    ctx?: RequestContext;
    /** Set when this signature is one of several made in a single sitting. */
    batchId?: string | null;
  }): Promise<{ hashBefore: string; hashAfter: string; sealedAt: Date }> {
    const { document, signer } = params;
    const store = this.requireStore();

    // The document as the signer read it. Fetched and hashed here rather than
    // trusting the stored value, so an object swapped underneath us is caught
    // BEFORE a signature is attached to it.
    const currentBytes = await this.withStorage('reading the document to sign', () =>
      store.get(document.storageKey),
    );
    const hashBefore = sha256(currentBytes);
    if (hashBefore !== document.sha256) {
      throw new BadRequestException(
        'This document has changed since it was issued and cannot be signed. Please contact your administrator.',
      );
    }

    // Always re-rendered from the ORIGINAL, never appended to the last seal —
    // which is what keeps three signers to one signature block and one
    // certificate instead of six pages.
    const baseBytes = document.originalKey
      ? await this.withStorage('reading the original document', () =>
          store.get(document.originalKey as string),
        )
      : currentBytes;

    const consentAt = new Date();
    const signedAt = new Date();

    const previous = await this.prisma.documentSignature.findMany({
      where: { documentId: document.id },
      orderBy: { signedAt: 'asc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        customer: { select: { name: true, email: true } },
        signer: { select: { role: true, userId: true, customerId: true } },
      },
    });

    const priorSigners = await Promise.all(
      previous.map(async (s) => ({
        role: roleLabel(s.signer?.role ?? null),
        signerName:
          s.signerName ??
          (s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : s.customer?.name ?? ''),
        signerEmail: s.user?.email ?? s.customer?.email ?? '',
        consentText: s.consentText,
        consentAt: s.consentAt,
        signedAt: s.signedAt,
        hashBefore: s.hashBefore,
        // Provenance for an earlier signature lives on its own event row; the
        // certificate reprints what was recorded then, never today's request.
        ...(s.userId ? await this.signatureContext(s.userId, document.id) : {}),
        signatureImage: await this.withStorage('reading a signature', () => store.get(s.signatureKey)),
        signatureSha256: s.signatureSha256,
        /*
          What that signature was worth, honestly.

          This was hardcoded 'SESSION' on both branches, so the certificate has
          never once been able to say a signature came from a link — the
          renderer has printed that distinction since the day it was written and
          nothing ever asked it to. A reader who catches one line overstating
          itself has no reason to trust the others.
        */
        strength: signatureStrength({ userId: s.userId }),
      })),
    );

    const sealed = await sealSignedPdf(baseBytes, {
      documentTitle: document.title,
      organizationName: document.organization?.name ?? '',
      signers: [
        ...priorSigners,
        {
          role: roleLabel(params.currentStep?.role ?? null),
          signerName: signer.name,
          signerEmail: signer.email ?? '',
          consentText: CONSENT_TEXT,
          consentAt,
          signedAt,
          hashBefore,
          sessionAuthenticatedAt:
            signer.kind === 'user' ? signer.sessionAuthenticatedAt ?? null : null,
          ip: params.ctx?.ip ?? null,
          userAgent: params.ctx?.userAgent ?? null,
          appVersion: params.ctx?.appVersion ?? null,
          lat: params.ctx?.lat ?? null,
          lng: params.ctx?.lng ?? null,
          signatureImage: params.png,
          signatureSha256: params.signatureHash,
          strength: signer.kind === 'user' ? 'SESSION' : 'LINK',
        },
      ],
    });

    const hashAfter = sha256(sealed);
    const sealedKey = documentKey(params.organizationId, hashAfter, 'pdf');
    await this.withStorage('sealing the document', () => store.put(sealedKey, sealed, 'application/pdf'));
    const sealedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          storageKey: sealedKey,
          sha256: hashAfter,
          sizeBytes: sealed.length,
          // Only the LAST signature finishes the document. Marking it SIGNED at
          // step one would take it off everybody's list while two people still
          // had to sign it.
          ...(params.isLastStep ? { status: 'SIGNED' as const } : {}),
        },
      });

      if (params.signerRowId) {
        /*
          A step can be signed twice, and the schema only allows one.

          `DocumentSignature.signerId` is unique, so re-signing a step that was
          returned by a send-back would violate it and throw — send-back
          deliberately leaves earlier signatures in place as history. Detaching
          the superseded row keeps that history and frees the slot; deleting it
          would destroy evidence to satisfy a constraint.
        */
        await tx.documentSignature.updateMany({
          where: { signerId: params.signerRowId },
          data: { signerId: null },
        });
        await tx.documentSigner.update({
          where: { id: params.signerRowId },
          data: {
            status: 'SIGNED',
            signedAt,
            // Who actually signed, out of everyone who could have. Until this
            // moment the step had no answer to that, and recording it is what
            // takes the document off the others' lists.
            ...(signer.kind === 'user' ? { userId: signer.userId } : {}),
          },
        });
      }

      await tx.documentSignature.create({
        data: {
          documentId: document.id,
          signerId: params.signerRowId,
          userId: signer.kind === 'user' ? signer.userId : null,
          customerId: signer.kind === 'customer' ? signer.customerId ?? null : null,
          signerName: signer.name,
          signerRole: signer.kind === 'customer' ? signer.typedRole ?? null : null,
          batchId: params.batchId ?? null,
          signatureKey: params.sigKey,
          signatureSha256: params.signatureHash,
          consentText: CONSENT_TEXT,
          consentAt,
          signedAt,
          hashBefore,
          hashAfter,
          sealedAt,
          idempotencyKey: params.idempotencyKey,
        },
      });

      /*
        CONSENTED is written here too, if it is not already on the trail.

        `recordConsent` writes it when the client walks the flow properly, and
        both clients do. But a complete legal record must not depend on a client
        having made an extra call: the consent text and time are stored on the
        signature either way, so a trail missing the entry would contradict the
        certificate page printed from the same row.
      */
      const alreadyConsented = await tx.documentEvent.count({
        where: { documentId: document.id, type: 'CONSENTED' },
      });
      const types = alreadyConsented > 0
        ? (['SIGNED', 'SEALED'] as const)
        : (['CONSENTED', 'SIGNED', 'SEALED'] as const);

      for (const type of types) {
        await tx.documentEvent.create({
          data: {
            documentId: document.id,
            type,
            // A client has no user row, so the actor is null and the trail
            // carries the name they gave instead. Pretending a customer is a
            // member here would put a fake id into the evidence.
            actorId: signer.kind === 'user' ? signer.userId : null,
            meta: {
              ...(type === 'CONSENTED' ? { text: CONSENT_TEXT } : {}),
              ...(signer.kind === 'customer'
                ? { signedByLink: true, signerName: signer.name, batchId: params.batchId ?? null }
                : {}),
            },
            ...eventContext(params.ctx),
          },
        });
      }
    });

    // The original object is deliberately left in place. It is what the signer
    // read, it is content-addressed so nothing else can claim its key, and the
    // certificate page cites its hash — deleting it would remove the only copy
    // the before-hash describes.

    return { hashBefore, hashAfter, sealedAt };
  }

  /**
   * "I have read this" — an attestation of receipt, not of agreement.
   *
   * Weaker than a signature and honest about being weaker: no drawing, no seal,
   * no certificate. It exists because a safety policy needs proof somebody saw
   * it, and asking for a signature on one devalues the signatures that matter.
   */
  async acknowledgeDocument(data: {
    actor: DocumentActor;
    documentId: string;
    ctx?: RequestContext;
  }) {
    const document = await this.findSignableOr404(data.actor, data.documentId);
    if (document.type.signatureMode !== 'ACKNOWLEDGE') {
      throw new BadRequestException('This document needs a signature, not an acknowledgement.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id: document.id }, data: { status: 'ISSUED' } });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'ACKNOWLEDGED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
    });
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Payroll day — the staged batch
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * The people a batch can be matched against.
   *
   * Returned so the browser can run the matcher itself: thirty filenames
   * resolved locally is instant and lets the admin correct a row without a
   * round trip per keystroke. The matching is only a SUGGESTION — every
   * document is still filed by an explicit userId that the server re-checks
   * belongs to this organization.
   */
  async listMatchCandidates(data: { actor: DocumentActor }) {
    this.assertCanIssue(data.actor);
    return this.prisma.user.findMany({
      /*
        Staff only. Portal customers carry a customerId and belong to Clients
        Portals, not to a payroll run — they appeared in this picker beside real
        members, which invites issuing somebody's payslip to a customer of the
        business. `listOrgMembers` has carried this filter all along; this query
        was written without it.
      */
      where: {
        organizationId: data.actor.organizationId,
        isActive: true,
        customerId: null,
        role: { not: Role.CUSTOMER },
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        // Role and job title, so the template editor can answer "who would
        // actually receive this?" while the bindings are being chosen rather
        // than after a save. Same two fields the server resolves a template by.
        memberRoleId: true, position: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Everything staged and not yet released, with who it is for — and, where the
   * type has a route, who could sign each step.
   *
   * The candidates are resolved HERE rather than by a second call per draft.
   * A batch of thirty time sheets would otherwise be thirty round trips to
   * discover that twenty-nine of them had nothing to ask.
   */
  async listDrafts(data: { actor: DocumentActor }) {
    this.assertCanIssue(data.actor);
    const drafts = await this.prisma.document.findMany({
      where: { organizationId: data.actor.organizationId, status: 'DRAFT' },
      select: {
        id: true,
        title: true,
        periodYear: true,
        periodMonth: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { id: true, label: true, signatureMode: true, signerRoute: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    /*
      One resolution per distinct question, not per draft.

      Thirty time sheets against one type ask the same ORG_REPRESENTATIVE
      question thirty times, and members repeat across a batch too. The cache
      holds the PROMISE rather than the result, so concurrent drafts asking the
      same question share one query instead of both missing and both issuing it.
    */
    const cache = new Map<string, Promise<SignerCandidate[]>>();

    return Promise.all(
      drafts.map(async (d) => {
        const route = parseRoute(d.type.signerRoute);
        if (!route) return { ...d, routeSteps: null };

        const steps = await Promise.all(
          route.map(async (s, i): Promise<RouteCandidateStep> => ({
            order: i + 1,
            role: s.role,
            // The member is already selected above; asking the database who
            // they are would be a query to learn something in hand.
            candidates:
              s.role === 'MEMBER'
                ? [
                    {
                      kind: 'USER',
                      id: d.user.id,
                      name: `${d.user.firstName} ${d.user.lastName}`.trim(),
                      email: d.user.email,
                    },
                  ]
                : await this.cachedCandidatesForRole(
                    cache,
                    data.actor.organizationId,
                    d.user.id,
                    s.role,
                  ),
          })),
        );

        return { ...d, routeSteps: steps };
      }),
    );
  }

  /**
   * Release a staged batch.
   *
   * ALL OR NOTHING, in one transaction. Publishing the rows that resolved and
   * leaving the rest would put some payslips out and hide the problem behind a
   * half-finished screen — and one payslip in the wrong hands is not something
   * that can be taken back. Everything here is cheap: the uploading, hashing
   * and storing already happened, one request per file, so this is a status
   * flip and a set of event rows.
   */
  async publishBatch(data: {
    actor: DocumentActor;
    documentIds: string[];
    /*
      Chosen signers, per document, for steps whose route left a choice.

      Carried at publish rather than at upload because the chain is built at
      publish — and because a draft may sit for days between the two, during
      which the answer could change.
    */
    signerChoices?: Array<{
      documentId: string;
      choices: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
    }>;
    ctx?: RequestContext;
  }) {
    this.assertCanIssue(data.actor);

    const ids = [...new Set(data.documentIds.filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException('Nothing to publish');

    // Scoped by organization AND status: an id from another tenant, or one that
    // was already published, simply is not found — and the count check below
    // then refuses the whole batch rather than publishing the rest.
    const drafts = await this.prisma.document.findMany({
      where: { id: { in: ids }, organizationId: data.actor.organizationId, status: 'DRAFT' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { label: true, signatureMode: true, signerRoute: true } },
      },
    });

    if (drafts.length !== ids.length) {
      throw new BadRequestException(
        'Some of these documents are no longer staged. Reload the batch and try again.',
      );
    }

    const published = await this.prisma.$transaction(async (tx) => {
      const out: typeof drafts = [];
      for (const draft of drafts) {
        const updated = await tx.document.update({
          where: { id: draft.id },
          data: {
            status: isBlocking(draft.type.signatureMode) ? 'AWAITING_SIGNATURE' : 'ISSUED',
            issuedAt: new Date(),
          },
        });
        /*
          The chain is built HERE, not at upload.

          Documents are staged as drafts and published in a batch, so upload is
          not the moment they become real — publishing is. Building the route at
          upload would resolve signers for documents that might be discarded,
          and leave a published one with no chain at all.
        */
        await this.createSignerRows(
          tx,
          updated,
          draft.type.signerRoute,
          data.signerChoices?.find((c) => c.documentId === draft.id)?.choices,
        );

        await tx.documentEvent.create({
          data: {
            documentId: draft.id,
            type: 'ISSUED',
            actorId: data.actor.userId,
            ...eventContext(data.ctx),
          },
        });
        out.push({ ...draft, ...updated } as (typeof drafts)[number]);
      }
      return out;
    });

    // Notifications AFTER the transaction commits. Emitting inside it would
    // tell thirty people about documents that a rollback then un-published.
    for (const doc of published) {
      this.notifyIssued(
        doc.id,
        doc.user,
        doc.type.label,
        doc.title,
        isBlocking(doc.type.signatureMode),
      );
    }

    return { published: published.length };
  }

  /**
   * Throw a staged row away before anyone has seen it.
   *
   * A hard delete, unlike `revoke`: nothing was ever issued, so there is no
   * record to preserve. The object is left alone because it is
   * content-addressed and another member's identical file may point at it.
   */
  async discardDraft(data: { actor: DocumentActor; documentId: string }) {
    this.assertCanIssue(data.actor);
    const draft = await this.prisma.document.findFirst({
      where: {
        id: data.documentId,
        organizationId: data.actor.organizationId,
        status: 'DRAFT',
      },
    });
    if (!draft) throw new NotFoundException('Staged document not found');
    await this.prisma.document.delete({ where: { id: draft.id } });
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Reading
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * One member's documents.
   *
   * `targetUserId` defaults to the caller. Reading YOUR OWN file needs no
   * permission at all and never will — it is your data. Reading someone
   * else's is a distinct grant, checked below.
   *
   * Returns metadata only. No URL is minted here: a list of two hundred
   * documents carrying two hundred live links would be two hundred leaked
   * capabilities and would make "opened" mean nothing.
   */
  /**
   * Everything the organization has issued, as one register.
   *
   * The gap this closes: every other list here answers "what does THIS PERSON
   * have" — `listForMember` takes one user id and defaults to the caller. So an
   * admin could inspect one member at a time and never see the shape of the
   * whole thing: what went out, who never opened it, what is still unsigned.
   *
   * Organized by the question being asked rather than by date, because the
   * useful ones are not "everything":
   *
   *   awaiting   still needs a signature — the only rows blocking anybody
   *   unopened   delivered and never looked at, which nothing surfaced before
   *   signed     finished, kept for the evidence trail
   *   all        the register proper, for looking something up
   *
   * DRAFT is excluded from every tab. A draft is a staged batch that no member
   * can see, so counting it as "sent" would overstate what was delivered — and
   * the issue screen already shows drafts, where they belong.
   *
   * Returns NO urls, like every other list here. A link is minted only by an
   * explicit open, and that mint IS the delivery evidence; a register that
   * pre-fetched links would quietly destroy the audit trail it exists to show.
   *
   * Needs `canViewMemberDocuments` and nothing more. Opening a file is checked
   * separately in `getDownloadUrl`, so chasing a signature never becomes the
   * ability to read a colleague's payslip.
   */
  /**
   * The filing cabinet: one level of folders at a time.
   *
   * A flat register answers "what needs attention". It is the wrong shape for
   * "find the March payslip for Mike", which is how people actually look for a
   * document they know exists — by walking to it.
   *
   * Three orderings, because two jobs look for the same document differently.
   * Payroll thinks type-then-period; HR thinks person-then-file. Forcing either
   * to use the other's hierarchy makes them scroll:
   *
   *   type     Type   → Year   → Member
   *   member   Member → Type   → Year
   *   year     Year   → Type   → Member
   *
   * ONE LEVEL PER REQUEST, with counts. The whole tree is never assembled:
   * that would be a query over every document in the organization to render a
   * screen showing eight folders, and it would get slower every month the
   * product is used. Each level is one groupBy plus one lookup to turn ids into
   * names, both scoped by the path already walked.
   *
   * Undated documents get their own folder rather than being hidden. A ONE_OFF
   * type has no period by design — a driving licence does not belong to March —
   * and dropping those rows from a year-grouped tree would make documents
   * disappear from a cabinet that claims to hold everything.
   */
  async browse(data: {
    actor: DocumentActor;
    groupBy?: 'type' | 'member' | 'year';
    typeId?: string;
    userId?: string;
    year?: number | null;
    /** Explicitly at the undated folder, which is not the same as "no filter". */
    undated?: boolean;
  }) {
    if (!data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }

    const groupBy = data.groupBy ?? 'type';
    const order: ('type' | 'member' | 'year')[] =
      groupBy === 'member'
        ? ['member', 'type', 'year']
        : groupBy === 'year'
          ? ['year', 'type', 'member']
          : ['type', 'year', 'member'];

    // Every level of the path already chosen narrows the query. The org scope
    // is first and unconditional.
    const where: Prisma.DocumentWhereInput = {
      organizationId: data.actor.organizationId,
      status: { not: 'DRAFT' },
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(data.undated ? { periodYear: null } : data.year ? { periodYear: data.year } : {}),
    };

    const chosen = {
      type: !!data.typeId,
      member: !!data.userId,
      year: data.year != null || !!data.undated,
    };

    // The next level is the first in this ordering that has not been chosen.
    const next = order.find((level) => !chosen[level]) ?? null;

    if (!next) {
      // Every folder walked: this is the shelf, so return the documents.
      const docs = await this.prisma.document.findMany({
        where,
        select: {
          id: true, title: true, status: true,
          periodYear: true, periodMonth: true, issuedAt: true,
          firstOpenedAt: true, expiresOn: true, sizeBytes: true, mimeType: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          type: { select: { id: true, label: true } },
          signatures: {
            select: { signedAt: true },
            orderBy: { signedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ periodMonth: 'desc' }, { issuedAt: 'desc' }],
        take: 500,
      });

      return {
        groupBy,
        level: 'documents' as const,
        folders: [],
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          periodYear: d.periodYear,
          periodMonth: d.periodMonth,
          issuedAt: d.issuedAt,
          openedAt: d.firstOpenedAt,
          signedAt: d.signatures.at(-1)?.signedAt ?? null,
          expiresOn: d.expiresOn,
          sizeBytes: d.sizeBytes,
          mimeType: d.mimeType,
          memberId: d.user.id,
          memberName: `${d.user.firstName} ${d.user.lastName}`.trim(),
          typeId: d.type.id,
          typeLabel: d.type.label,
        })),
      };
    }

    const field = next === 'type' ? 'typeId' : next === 'member' ? 'userId' : 'periodYear';
    const groups = await this.prisma.document.groupBy({
      by: [field as any],
      where,
      _count: true,
    });

    // One lookup turns ids into names — not one per folder.
    let labels = new Map<string, string>();
    if (next === 'type') {
      const ids = groups.map((g: any) => g.typeId).filter(Boolean);
      const types = await this.prisma.documentType.findMany({
        where: { id: { in: ids }, organizationId: data.actor.organizationId },
        select: { id: true, label: true },
      });
      labels = new Map(types.map((x) => [x.id, x.label]));
    } else if (next === 'member') {
      const ids = groups.map((g: any) => g.userId).filter(Boolean);
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, organizationId: data.actor.organizationId },
        select: { id: true, firstName: true, lastName: true },
      });
      labels = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    }

    const folders = groups
      .map((g: any) => {
        const raw = g[field];
        if (next === 'year') {
          return {
            kind: 'year' as const,
            key: raw == null ? 'undated' : String(raw),
            label: raw == null ? null : String(raw), // null → the client names it
            undated: raw == null,
            count: g._count,
          };
        }
        return {
          kind: next,
          key: String(raw),
          label: labels.get(String(raw)) ?? null,
          undated: false,
          count: g._count,
        };
      })
      // Newest year first; everything else alphabetical. Undated last, because
      // it is a residue rather than a period.
      .sort((a, b) => {
        if (a.undated !== b.undated) return a.undated ? 1 : -1;
        if (next === 'year') return Number(b.key) - Number(a.key);
        return (a.label ?? '').localeCompare(b.label ?? '');
      });

    return { groupBy, level: next, folders, documents: [] };
  }

  /**
   * Turn a type's route into real signer rows for one document.
   *
   * Called inside the issuing transaction, so a document either has its whole
   * chain or none of it — a half-built route would strand a document with no
   * way to tell whose turn it was.
   *
   * Frozen here on purpose. A member changing manager next month must not
   * re-route a document already in flight, and the certificate has to be able
   * to say who was ASKED, not who would be asked today.
   *
   * A step with no candidate is written as SKIPPED rather than left pending or
   * dropped. Pending would strand the chain on somebody who does not exist;
   * dropping it would hide from the register that the route asked for a signer
   * this document never had.
   */
  private async createSignerRows(
    tx: Prisma.TransactionClient,
    document: { id: string; userId: string; organizationId: string },
    signerRoute: unknown,
    choices?: Array<{
      order: number;
      userId?: string | null;
      customerId?: string | null;
      /** Typed in for this document — a counterparty with no record anywhere. */
      email?: string | null;
      name?: string | null;
    }>,
  ): Promise<void> {
    const route = parseRoute(signerRoute);
    if (!route) return; // No route: one signature by the member, exactly as before.

    for (const [i, step] of route.entries()) {
      const order = i + 1;

      /*
        A customer step resolves to the client of a space this member works in,
        and is signed by an emailed link rather than a login. Refused until
        there was a way to sign it — there is now.
      */
      const chosen = choices?.find((c) => c.order === order);
      /*
        The member is the document's own `userId` — by definition, not by
        lookup. Resolving them through a query would spend a round trip to
        learn something already in hand, and would make the step SKIP if that
        query ever came back empty: a time sheet published as though nobody
        had to sign it, which is the one outcome this chain exists to prevent.
      */
      const candidates: SignerCandidate[] =
        step.role === 'MEMBER'
          ? [{ kind: 'USER', id: document.userId, name: '', email: null }]
          : await this.candidatesForRole(document.organizationId, document.userId, step.role);

      let userId: string | null = null;
      let customerId: string | null = null;
      let email: string | null = null;
      let contactName: string | null = null;
      let eligibleUserIds: string[] = [];

      /*
        Typed in, for a counterparty the system has never heard of.

        Always allowed, whatever the cascade offered. A closed list is exactly
        useless the one time somebody must send a document to a person who is
        not a member, not a CRM client and not a space's contact — and that is
        an ordinary Tuesday, not an edge case.

        It is checked against the candidates ONLY when it claims to be one of
        them. A free address claims nothing, so there is nothing to check it
        against — the issuer is choosing where to send a document they can
        already open, which is a decision they are entitled to make and which
        the evidence trail records.
      */
      if (chosen?.email && !chosen.userId && !chosen.customerId) {
        const addr = chosen.email.trim().toLowerCase();
        if (!isUsableEmail(addr)) {
          throw new BadRequestException(`Step ${order} needs a usable email address`);
        }
        email = addr;
        contactName = chosen.name?.trim() || addr;
      } else if (chosen?.userId || chosen?.customerId) {
        // An explicit choice still has to be one of the candidates — the picker
        // is a convenience, not an authorisation.
        const ok = candidates.some(
          (c) =>
            (c.kind === 'USER' && c.id === chosen.userId) ||
            ((c.kind === 'CUSTOMER' || c.kind === 'CONTACT') && c.id === chosen.customerId),
        );
        if (!ok) {
          throw new BadRequestException(`That signer cannot sign step ${order} of this document`);
        }
        userId = chosen.userId ?? null;
        if (userId) eligibleUserIds = [userId];
        // A space contact is identified as `space:<id>` and has no client row —
        // it carries an address, not a foreign key.
        const contact = candidates.find((c) => c.kind === 'CONTACT' && c.id === chosen.customerId);
        if (contact) {
          email = contact.email;
          contactName = contact.name;
        } else {
          customerId = chosen.customerId ?? null;
        }
      } else if (candidates.length === 1) {
        // Exactly one: there is no question to ask.
        const only = candidates[0];
        if (only.kind === 'USER') {
          userId = only.id;
          eligibleUserIds = [only.id];
        } else if (only.kind === 'CUSTOMER') {
          customerId = only.id;
        } else {
          /*
            A client SPACE's own contact — an address with no record behind it.

            There is nothing to point a foreign key at, and that is correct
            rather than a gap: the space carries the contact, and creating a
            client row to mirror it would make a second copy free to drift from
            the first. The address and the name are the whole identity.
          */
          email = only.email;
          contactName = only.name;
        }
      } else if (candidates.length > 1) {
        /*
          Several people may sign it, and any of them can.

          This used to refuse and make the issuer pick one — which is right when
          a step has a single responsible and wrong when a shift has a space
          manager and two shift leaders who can each countersign. Naming one of
          them at issue means the document waits on whoever is away.

          The step stays ONE row; it simply carries the set. `userId` is left
          null and records who actually signed, at the moment they do.
        */
        eligibleUserIds = candidates.filter((c) => c.kind === 'USER').map((c) => c.id);
        if (eligibleUserIds.length === 0) {
          // Several CUSTOMER or CONTACT candidates cannot be resolved this way:
          // a client is one counterparty, not a pool, so the issuer chooses.
          throw new BadRequestException(
            `Step ${order} has more than one possible signer — choose one before issuing`,
          );
        }
      } else {
        /*
          Nobody can sign a step the type says must be signed.

          This used to create the step as SKIPPED, and that was wrong in the
          worst way available: the document went out looking like it had
          travelled the route, past the very approval the organisation
          configured, with nothing anywhere saying the step had been dropped.
          A time sheet reached the client without the agency ever countersigning
          it, and the register showed a healthy chain.

          Refusing is visible, it happens at the moment somebody can fix it, and
          nothing is half-issued. The message says what to configure, because
          "no signer found" sends an admin looking through the document rather
          than through the member's space membership, which is where the answer
          is.
        */
        throw new BadRequestException(this.noSignerMessage(step.role, order));
      }

      /*
        Freeze WHERE this step is reachable, at issue.

        The link resolves signer rows by address, so it has to be on the row —
        and it has to be a copy, not a lookup. A client changing their email
        next month must not silently redirect a document already in flight to
        an address nobody agreed to send it to.
      */
      if (!email && (customerId || userId)) {
        const resolved = customerId
          ? await tx.customer.findUnique({ where: { id: customerId }, select: { email: true, name: true } })
          : await tx.user.findUnique({ where: { id: userId as string }, select: { email: true, firstName: true, lastName: true } });
        if (resolved) {
          email = (resolved as any).email ?? null;
          const person = `${(resolved as any).firstName ?? ''} ${(resolved as any).lastName ?? ''}`.trim();
          contactName = (resolved as any).name ?? (person || null);
        }
      }

      /*
        The subject cannot hold a later step, however the request got here.

        Filtering the candidates stops it being OFFERED; this stops it being
        DONE. A typed-in address is checked against nothing else — that is the
        point of it — so this is the only thing standing between an issuer and a
        chain where the same person signs twice under two hats, which reads as
        three signatures and is worth one.
      */
      if (step.role !== 'MEMBER') {
        const subject = await tx.user.findUnique({
          where: { id: document.userId },
          select: { id: true, email: true },
        });
        if (subject && isSelfSigning(subject, { userId, email })) {
          throw new BadRequestException(
            `Step ${order} would be signed by the same person the document is about. A countersignature has to come from somebody else.`,
          );
        }
      }

      await tx.documentSigner.create({
        data: {
          documentId: document.id,
          order,
          role: step.role,
          userId,
          /*
            Whoever may sign, always — including the single-signer case.

            Keeping this populated even when one person is named is what lets
            "what is waiting for me" ask ONE indexed question instead of an OR
            across two columns, which no single index can serve. The fallback
            makes it an invariant rather than something three branches have to
            remember.
          */
          eligibleUserIds: eligibleUserIds.length ? eligibleUserIds : userId ? [userId] : [],
          customerId,
          /*
            Normalised, always.

            The link resolves rows by exact address, and it lowercases what a
            person types into the form. A contact stored as somebody typed it —
            "PLang@AgruAmerica.com" is what is actually in this database — would
            produce a row the link could never match, and a document waiting on
            a person who could never reach it.
          */
          email: email ? email.trim().toLowerCase() : null,
          contactName,
          status: 'PENDING',
        },
      });
    }
  }

  /**
   * Where an earlier signature was made from.
   *
   * Re-rendering the certificate must reprint what was recorded THEN, not the
   * provenance of whoever is signing now — otherwise a manager's device would
   * appear beside the worker's signature. The evidence trail already holds it:
   * the SIGNED event carries ip, device, app version and location, written at
   * the moment that signature was made.
   */
  private async signatureContext(signerUserId: string, documentId: string) {
    const event = await this.prisma.documentEvent.findFirst({
      where: { documentId, type: 'SIGNED', actorId: signerUserId },
      orderBy: { at: 'desc' },
      select: { ip: true, userAgent: true, appVersion: true, lat: true, lng: true },
    });
    return {
      sessionAuthenticatedAt: null as Date | null,
      ip: event?.ip ?? null,
      userAgent: event?.userAgent ?? null,
      appVersion: event?.appVersion ?? null,
      lat: event?.lat ?? null,
      lng: event?.lng ?? null,
    };
  }

  /**
   * Send a document back to an earlier signer, with a reason.
   *
   * The alternative — revoke and re-issue — throws away the chain, so the
   * worker signs a NEW document and the record of the first attempt disappears.
   * Sending back keeps one document and one history: the earlier step goes
   * pending again, everything after it goes pending again, and the trail says
   * why.
   *
   * Only the person currently being waited on may do it. Anybody else "sending
   * back" would be reaching into a document that is not in their hands.
   *
   * The signatures already collected are NOT deleted. They are what happened;
   * the seals that carry them remain valid for the versions they described, and
   * re-signing adds to the chain rather than rewriting it.
   */
  async sendBack(data: {
    actor: DocumentActor;
    documentId: string;
    reason: string;
    ctx?: RequestContext;
  }) {
    const reason = (data.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Say why you are sending it back');
    }

    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, title: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const steps = await this.signerSteps(document.id);
    const current = nextPendingStep(steps);
    if (!current) throw new BadRequestException('This document is not waiting for a signature.');
    if (current.userId !== data.actor.userId) {
      throw new ForbiddenException('This document is waiting for somebody else.');
    }

    // The nearest earlier step that actually signed. A skipped one cannot be
    // sent back to — nobody was ever asked.
    const target = [...steps]
      .filter((s) => s.order < current.order && s.status === 'SIGNED')
      .sort((a, b) => b.order - a.order)[0];
    if (!target) {
      throw new BadRequestException('There is no earlier signer to send this back to.');
    }

    await this.prisma.$transaction(async (tx) => {
      // That step and everything after it are pending again. Leaving the
      // in-between steps signed would let the chain skip them on the way back
      // up, and the order is the point.
      await tx.documentSigner.updateMany({
        where: { documentId: document.id, order: { gte: target.order }, status: 'SIGNED' },
        data: { status: 'PENDING', signedAt: null },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'SENT_BACK',
          actorId: data.actor.userId,
          meta: { reason, toStep: target.order },
          ...eventContext(data.ctx),
        },
      });
    });

    await this.notifyNextSigner(document.id, document.title);
    return { documentId: document.id, backToStep: target.order };
  }

  /**
   * The chain on one document, for somebody about to sign it.
   *
   * A signer needs to see what is above their name — a manager countersigning a
   * time sheet is agreeing with the worker's signature, and being asked to do
   * that blind is being asked to rubber-stamp.
   *
   * Readable by anyone IN the chain, or by anyone allowed to see member
   * documents. Deliberately not gated on `canOpenMemberDocuments`: who signed
   * and when is metadata, and needing the right to read a payslip in order to
   * see whether it was signed would make the whole register unusable.
   */
  async documentChain(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, title: true, userId: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const rows = await this.prisma.documentSigner.findMany({
      where: { documentId: document.id },
      orderBy: { order: 'asc' },
      select: {
        order: true, role: true, status: true, userId: true, eligibleUserIds: true,
        customerId: true, signedAt: true,
        user: { select: { firstName: true, lastName: true } },
        customer: { select: { name: true } },
      },
    });

    // Same reasoning as opening it: somebody asked to sign must be able to see
    // what has been signed above them, and until they sign there is no userId
    // on their step to match.
    const inChain = rows.some(
      (r) =>
        r.userId === data.actor.userId ||
        (r.eligibleUserIds ?? []).includes(data.actor.userId),
    );
    const isSubject = document.userId === data.actor.userId;
    if (!inChain && !isSubject && !data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see this document');
    }

    const steps = rows.map((r) => ({
      order: r.order,
      role: r.role,
      status: r.status,
      name: r.user ? `${r.user.firstName} ${r.user.lastName}`.trim() : (r.customer?.name ?? null),
      signedAt: r.signedAt,
      isYou: r.userId === data.actor.userId,
    }));

    const progress = chainProgress(rows as unknown as SignerStep[]);
    return {
      documentId: document.id,
      title: document.title,
      steps,
      total: progress.total,
      signed: progress.signed,
      complete: progress.complete,
      currentOrder: progress.current?.order ?? null,
    };
  }

  /** The chain on one document, in order — the shape every caller reasons about. */
  private async signerSteps(documentId: string): Promise<SignerStep[]> {
    const rows = await this.prisma.documentSigner.findMany({
      where: { documentId },
      orderBy: { order: 'asc' },
      select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true, signedAt: true },
    });
    return rows as SignerStep[];
  }

  /**
   * Who could sign each step of a type's route, for one member.
   *
   * Asked BEFORE issuing, so the screen can present a choice where there is
   * one, rather than the service picking somebody and the issuer discovering it
   * afterwards. Returns candidates per step; the caller sends back a choice for
   * any step that has more than one.
   *
   * Zero candidates is not an error. A route asking for a customer, issued to a
   * member whose spaces have none, produces a SKIPPED step — the alternative is
   * a chain stranded forever on a signer who does not exist.
   */
  async routeCandidates(data: { actor: DocumentActor; memberId: string; typeId: string }) {
    if (!data.actor.canIssueDocuments) {
      throw new ForbiddenException('You cannot issue documents');
    }
    const org = data.actor.organizationId;

    const [type, member] = await Promise.all([
      this.prisma.documentType.findFirst({
        where: { id: data.typeId, organizationId: org },
        select: { id: true, label: true, signerRoute: true },
      }),
      this.prisma.user.findFirst({
        where: { id: data.memberId, organizationId: org },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    if (!type) throw new NotFoundException('Document type not found');
    if (!member) throw new NotFoundException('Member not found');

    const route = parseRoute(type.signerRoute);
    if (!route) return { steps: [] as RouteCandidateStep[] };

    const steps: RouteCandidateStep[] = [];
    for (const [i, s] of route.entries()) {
      steps.push({
        order: i + 1,
        role: s.role,
        candidates: await this.candidatesForRole(org, member.id, s.role),
      });
    }
    return { steps };
  }

  /**
   * The people a single role could resolve to.
   *
   * Each role answers a different question, and none of them is "pick an admin
   * and hope":
   *
   *   MEMBER              the person the document is about — always exactly one
   *   RESPONSIBLE         their `approve` routing, which is configured per
   *                       member and is deliberately not their notify list
   *   ORG_REPRESENTATIVE  somebody who may sign for the organization. Scoped to
   *                       the permission to issue documents rather than to
   *                       "admin", so it follows the same authority that puts a
   *                       document into somebody's file in the first place.
   *   CUSTOMER            clients of the spaces this member works in. The
   *                       document carries no space of its own, so the member is
   *                       what connects it to a client.
   */
  /**
   * Documents belonging to SOMEBODY ELSE that are waiting on this person now.
   *
   * Every other query on this screen is scoped to the caller's own personnel
   * file, which is right for a payslip and wrong for a countersignature: a
   * responsible signing a worker's time sheet is not the subject of it and so
   * never saw it. It arrived as a push notification about a document that
   * existed nowhere in the app.
   *
   * Authorisation is the signer row itself — being named as the signer of a
   * step is what entitles someone to that one document, and nothing else. Only
   * the CURRENT step qualifies: a document three people down the chain must not
   * appear on somebody's list before it is their turn, or the list stops
   * meaning "yours to do" and stops being read.
   *
   * Shared by the list and the badge so the two can never disagree about what
   * is outstanding.
   */
  private async documentsWaitingOnMe(actor: DocumentActor) {
    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: { not: actor.userId },
        status: 'AWAITING_SIGNATURE',
        /*
          Narrowed in SQL; whether it is their TURN is decided below, since
          "first pending step" is not expressible here and duplicating that rule
          in a query is how the two drift.

          Either named on the step or among the people it is open to — a step
          with three eligible leaders is genuinely waiting on all three, and
          matching only `userId` would hide it from everyone until somebody had
          already signed it.
        */
        signers: { some: { status: 'PENDING', eligibleUserIds: { has: actor.userId } } },
      },
      select: {
        id: true,
        title: true,
        typeId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        sizeBytes: true,
        mimeType: true,
        issuedAt: true,
        expiresOn: true,
        firstOpenedAt: true,
        user: { select: { firstName: true, lastName: true } },
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
        signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
      },
      orderBy: { issuedAt: 'asc' },
      // A backstop, not pagination. Somebody with more than this waiting has a
      // process problem that a longer list would not solve.
      take: 200,
    });

    return rows.filter((d) =>
      isCurrentSigner(d.signers as unknown as SignerStep[], actor.userId),
    );
  }

  /** Why a step cannot be filled, and what to do about it. */
  private noSignerMessage(role: DocumentSignerRole, order: number): string {
    switch (role) {
      case 'RESPONSIBLE':
        return `Step ${order} needs the person who signs off for this member, and nobody is set. Choose one under “Signs off for …” on their space membership.`;
      case 'ORG_REPRESENTATIVE':
        return `Step ${order} needs somebody signing for the organisation, and nobody in it can. Give a member the right to manage people, or remove the step from this document type.`;
      case 'CUSTOMER':
        return `Step ${order} needs the client of a space this member works in, and there is none. Add the client to the space, or remove the step from this document type.`;
      default:
        return `Step ${order} of this document has no possible signer.`;
    }
  }

  /**
   * `candidatesForRole` memoised for the length of one call.
   *
   * ORG_REPRESENTATIVE is the same answer for every member in the batch, so it
   * is keyed without one; the others genuinely differ per member.
   */
  private cachedCandidatesForRole(
    cache: Map<string, Promise<SignerCandidate[]>>,
    organizationId: string,
    memberId: string,
    role: DocumentSignerRole,
  ): Promise<SignerCandidate[]> {
    const key = role === 'ORG_REPRESENTATIVE' ? role : `${role}:${memberId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = this.candidatesForRole(organizationId, memberId, role);
    cache.set(key, pending);
    return pending;
  }

  private async candidatesForRole(
    organizationId: string,
    memberId: string,
    role: DocumentSignerRole,
  ): Promise<SignerCandidate[]> {
    /*
      Who the document is ABOUT, so they can be kept off every later step.

      A chain means something because each step is a different person vouching.
      The member appearing again under a second hat — a client record carrying
      their own address, or an admin account that is also the subject — makes
      every signature below the first one prove nothing, and it happens quietly
      rather than by anybody deciding it should.
    */
    const subject =
      role === 'MEMBER'
        ? null
        : await this.prisma.user.findUnique({
            where: { id: memberId },
            select: { id: true, email: true },
          });
    const notTheSubject = (c: SignerCandidate) =>
      !subject ||
      !isSelfSigning(subject, { userId: c.kind === 'USER' ? c.id : null, email: c.email });
    if (role === 'MEMBER') {
      const u = await this.prisma.user.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return u ? [{ kind: 'USER', id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email }] : [];
    }

    if (role === 'RESPONSIBLE') {
      // allowLeaderDefault false: a space nobody configured contributes no one.
      // Sign-off is not something to fall into by being a space leader.
      const ids = await resolveMemberRouting(this.prisma as any, organizationId, memberId, 'approve', false);
      ids.delete(memberId); // nobody approves their own hours
      if (ids.size === 0) return [];
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...ids] }, organizationId, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return users
        .map((u) => ({
          kind: 'USER' as const, id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email,
        }))
        .filter(notTheSubject);
    }

    if (role === 'ORG_REPRESENTATIVE') {
      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          customerId: null,
          OR: [{ role: 'ADMIN' }, { canManageUsers: true }],
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        take: 50,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const, id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email,
        }))
        .filter(notTheSubject);
    }

    /*
      CUSTOMER — through the member's spaces, since a document has no space.

      Where the counterparty comes from is DECIDED by the space, not configured:

        • the space IS a client company (`kind: CUSTOMER`) → its own contact,
          because the details are already there and a CRM record would be a
          second copy of them, free to drift
        • an internal space with the CRM module on → its client records
        • neither → nothing is offered, and the issuer types the address

      Typing it in is always available whatever this returns. A cascade decides
      what is OFFERED and must never decide what is possible: the one time
      somebody has to send a document to a person the system has never heard of
      is exactly when a closed list makes the product useless.
    */
    const spaces = await this.prisma.spaceAssignment.findMany({
      where: { userId: memberId, organizationId },
      select: {
        space: { select: { id: true, name: true, kind: true, contactName: true, contactEmail: true, enabledModules: true } },
      },
    });
    if (spaces.length === 0) return [];

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { enabledModules: true },
    });

    const out: SignerCandidate[] = [];
    const crmSpaceIds: string[] = [];

    for (const { space } of spaces) {
      if (!space) continue;
      // A space's own modules override the org's — the same rule the gates use.
      const modules = (space.enabledModules ?? org?.enabledModules ?? []) as string[];
      const source = counterpartySourceFor(space, Array.isArray(modules) ? modules : []);

      if (source === 'SPACE' && space.contactEmail) {
        out.push({
          kind: 'CONTACT',
          // The SPACE is the identity here: there is no client row to point at,
          // and the address is what the link will be addressed to anyway.
          id: `space:${space.id}`,
          name: space.contactName?.trim() || space.name,
          email: space.contactEmail,
        });
      } else if (source === 'CRM') {
        crmSpaceIds.push(space.id);
      }
    }

    if (crmSpaceIds.length > 0) {
      const customers = await this.prisma.customer.findMany({
        where: { organizationId, isActive: true, spaceId: { in: crmSpaceIds } },
        select: { id: true, name: true, email: true },
        take: 50,
      });
      for (const c of customers) {
        out.push({ kind: 'CUSTOMER', id: c.id, name: c.name, email: c.email ?? null });
      }
    }

    return out.filter(notTheSubject);
  }

  async listIssued(data: {
    actor: DocumentActor;
    tab?: 'awaiting' | 'unopened' | 'signed' | 'all';
    typeId?: string;
    userId?: string;
    year?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    if (!data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }

    const page = Math.max(1, data.page ?? 1);
    const limit = Math.min(100, Math.max(1, data.limit ?? 25));

    // The organization scope is on every branch below, never added later: it is
    // what stops a guessed type or user id reaching across tenants.
    const base: Prisma.DocumentWhereInput = {
      organizationId: data.actor.organizationId,
      status: { not: 'DRAFT' },
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(data.year ? { periodYear: data.year } : {}),
      ...(data.search
        ? { title: { contains: data.search.trim(), mode: 'insensitive' as const } }
        : {}),
    };

    const tabWhere = (tab: string): Prisma.DocumentWhereInput => {
      switch (tab) {
        case 'awaiting':
          return { ...base, status: 'AWAITING_SIGNATURE' };
        case 'unopened':
          return { ...base, firstOpenedAt: null, status: { in: ['ISSUED', 'AWAITING_SIGNATURE'] } };
        case 'signed':
          return { ...base, status: 'SIGNED' };
        default:
          return base;
      }
    };

    const tab = data.tab ?? 'awaiting';
    const where = tabWhere(tab);

    /*
      Counts for the tabs come from ONE grouped query plus one count, not one
      query per tab. Both are served by @@index([organizationId, status]).
    */
    const [rows, total, byStatus, unopened] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          periodYear: true,
          periodMonth: true,
          issuedAt: true,
          firstOpenedAt: true,
          expiresOn: true,
          sizeBytes: true,
          mimeType: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          type: { select: { id: true, label: true, signatureMode: true, isCredential: true } },
          signatures: {
            select: { signedAt: true },
            orderBy: { signedAt: 'desc' },
            take: 1,
          },
          /*
            The chain. Selected with the row rather than fetched per row: a
            register of fifty documents would otherwise be fifty extra queries
            to render a caption.
          */
          signers: {
            select: {
              order: true, role: true, status: true, userId: true, customerId: true,
              signedAt: true, notifiedAt: true,
              user: { select: { firstName: true, lastName: true } },
              customer: { select: { name: true } },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ issuedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
      this.prisma.document.groupBy({ by: ['status'], where: base, _count: true }),
      this.prisma.document.count({ where: tabWhere('unopened') }),
    ]);

    const counted = (s: string) =>
      byStatus.find((g) => g.status === s)?._count ?? 0;

    return {
      rows: rows.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        periodYear: d.periodYear,
        periodMonth: d.periodMonth,
        issuedAt: d.issuedAt,
        openedAt: d.firstOpenedAt,
        signedAt: d.signatures[0]?.signedAt ?? null,
        expiresOn: d.expiresOn,
        sizeBytes: d.sizeBytes,
        mimeType: d.mimeType,
        memberId: d.user.id,
        memberName: `${d.user.firstName} ${d.user.lastName}`.trim(),
        typeId: d.type.id,
        typeLabel: d.type.label,
        signatureMode: d.type.signatureMode,
        isCredential: d.type.isCredential,
        /*
          Where the document has got to. Absent for a document with no route,
          which is not "0 of 0" — it is a document that was never a chain, and
          the screen should say nothing rather than imply an empty one.
        */
        chain: d.signers.length
          ? (() => {
              const p = chainProgress(d.signers as unknown as SignerStep[]);
              const waiting = p.current;
              const row = waiting ? d.signers.find((s) => s.order === waiting.order) : null;
              return {
                total: p.total,
                signed: p.signed,
                complete: p.complete,
                currentOrder: waiting?.order ?? null,
                currentRole: waiting?.role ?? null,
                waitingOn: row
                  ? row.user
                    ? `${row.user.firstName} ${row.user.lastName}`.trim()
                    : (row.customer?.name ?? null)
                  : null,
                // How long it has been sitting there — the other half of
                // "waiting on whom".
                waitingSince: row?.notifiedAt ?? null,
              };
            })()
          : null,
      })),
      page,
      limit,
      total,
      counts: {
        awaiting: counted('AWAITING_SIGNATURE'),
        unopened,
        signed: counted('SIGNED'),
        all: byStatus.reduce((n, g) => n + g._count, 0),
      },
    };
  }

  async listForMember(data: {
    actor: DocumentActor;
    targetUserId?: string;
    typeId?: string;
    year?: number;
    search?: string;
    includeArchived?: boolean;
  }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;

    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }
    if (!isSelf) {
      await this.assertMemberOfOrg(targetUserId, data.actor.organizationId);
    }

    const where: Prisma.DocumentWhereInput = {
      // Both, always. The organization scope is what stops a stale or guessed
      // user id reaching across tenants even when the id is otherwise valid.
      organizationId: data.actor.organizationId,
      userId: targetUserId,
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.year ? { periodYear: data.year } : {}),
      ...(data.includeArchived ? {} : { status: { not: 'DRAFT' as const } }),
      ...(data.search
        ? { title: { contains: data.search.trim(), mode: 'insensitive' as const } }
        : {}),
    };

    const documents = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        title: true,
        typeId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        sizeBytes: true,
        mimeType: true,
        issuedAt: true,
        expiresOn: true,
        firstOpenedAt: true,
        rejectionReason: true,
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
        // Only what deciding "is this waiting on you" needs. Selected with the
        // documents so the list does not become one query per row.
        signers: { select: { order: true, role: true, status: true, userId: true, eligibleUserIds: true, customerId: true } },
      },
      orderBy: [
        { periodYear: 'desc' },
        { periodMonth: 'desc' },
        { issuedAt: 'desc' },
      ],
      // A personnel file is small by nature; this is a backstop against a
      // pathological account, not real pagination.
      take: 500,
    });

    /*
      Documents that are not in this file but are waiting on this person.

      Only on your OWN list. An admin looking at somebody's personnel file wants
      that file, not a countersignature queue belonging to the person they are
      looking at — mixing the two would make one screen answer two questions and
      neither of them clearly.
    */
    const alsoWaiting =
      isSelf && !data.typeId && !data.year && !data.search
        ? await this.documentsWaitingOnMe(data.actor)
        : [];

    const now = new Date();
    /*
      Whose turn it is, from the viewer's side.

      No route: the old meaning is the right one — the document is waiting on
      the person it was issued to. With a route: only while the pending step is
      theirs, which is what stops somebody who has already signed being told to
      sign again with no way to clear it.
    */
    const waitingOnViewer = (d: { status: string; signers?: SignerStep[] }): boolean => {
      if (d.status !== 'AWAITING_SIGNATURE') return false;
      // No rows is not a missing answer, it is the answer: a document issued
      // before routes existed, or under a type that has none. It waits on the
      // person it was issued to, which is what it has always meant.
      const steps = d.signers ?? [];
      if (steps.length === 0) return targetUserId === data.actor.userId;
      return isCurrentSigner(steps, data.actor.userId);
    };
    return [
      // Theirs to sign, first: it is somebody else's document and it is holding
      // up that person's month.
      ...alsoWaiting.map((d) => ({
        id: d.id,
        title: d.title,
        typeId: d.typeId,
        typeKey: d.type.key,
        typeLabel: d.type.label,
        periodYear: d.periodYear,
        periodMonth: d.periodMonth,
        status: d.status,
        sizeBytes: d.sizeBytes,
        mimeType: d.mimeType,
        issuedAt: d.issuedAt,
        expiresOn: d.expiresOn,
        unread: d.firstOpenedAt === null,
        needsSignature: true,
        rejectionReason: null,
        standing: null as string | null,
        // Whose document it is. Without this a manager sees nine rows called
        // "Time sheet September" and cannot tell them apart.
        forMember: `${d.user.firstName} ${d.user.lastName}`.trim(),
      })),
      ...documents.map((d) => ({
      id: d.id,
      title: d.title,
      typeId: d.typeId,
      typeKey: d.type.key,
      typeLabel: d.type.label,
      periodYear: d.periodYear,
      periodMonth: d.periodMonth,
      status: d.status,
      sizeBytes: d.sizeBytes,
      mimeType: d.mimeType,
      issuedAt: d.issuedAt,
      expiresOn: d.expiresOn,
      unread: d.firstOpenedAt === null,
      /*
        "Needs your signature" has to mean YOURS.

        A document with a route stays AWAITING_SIGNATURE until the whole chain
        is done, so reading the document's status told a member who had already
        signed that they still had to — with no way to make it go away. The
        chain knows better: where there are steps, this is true only while the
        pending one is theirs.
      */
      needsSignature: waitingOnViewer(d),
      // Only ever set on something the member supplied. Shown to them verbatim:
      // "rejected" with no reason is an instruction to upload the same photo.
      rejectionReason: d.rejectionReason,
      /*
        No standing until it counts.

        A PENDING_VERIFICATION licence with a 2030 date is not "valid" — the
        dispatch gate refuses it — and a green tick beside it is the single most
        misleading thing this list could show, because it says the opposite of
        what happens when the person is assigned to work.
      */
      standing:
        d.type.isCredential && d.status !== 'PENDING_VERIFICATION' && d.status !== 'REJECTED'
          ? credentialStanding(d.expiresOn, now)
          : null,
      // Their own file: the document is about them, so there is nobody to name.
      forMember: null as string | null,
      })),
    ];
  }

  /**
   * Mint a download link — and record that it happened.
   *
   * The mint IS the OPENED event. That is why no list endpoint returns a URL:
   * if links were handed out in bulk, "opened" would record a page render
   * rather than a person reading their contract, and the delivery evidence
   * would be worthless.
   */
  async getDownloadUrl(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    // Authorization first, storage second. Reversed, a server with S3
    // misconfigured would answer "storage is not configured" to a caller who is
    // not entitled to the document — which tells them it exists.
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      include: { type: { select: { label: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');

    const isSelf = document.userId === data.actor.userId;
    /*
      Being asked to sign it IS the authorisation to read it.

      A responsible countersigning a worker's time sheet is usually a shift
      leader, and shift leaders do not hold `canOpenMemberDocuments` — so
      without this they were sent a signature request for a document they were
      forbidden to open. Signing something you cannot read is the one outcome a
      signing feature must never produce.

      Scoped to this document by their own signer row, and it survives their
      signature on purpose: a person who signed something must always be able to
      retrieve what they signed.
    */
    /*
      Named on a step, OR among the people it is open to.

      `userId` is null until somebody signs, so matching it alone would refuse
      the document to exactly the people being asked to sign it — signing
      something you cannot read is the one outcome a signing feature must never
      produce.
    */
    const isSigner =
      isSelf ||
      (await this.prisma.documentSigner.count({
        where: { documentId: document.id, eligibleUserIds: { has: data.actor.userId } },
      })) > 0;

    if (!isSigner && !data.actor.canOpenMemberDocuments) {
      // Distinct from the list permission on purpose: a dispatcher may need to
      // know a certificate exists and expires on Friday without being able to
      // open a colleague's payslip.
      throw new ForbiddenException('You cannot open other members’ documents');
    }

    const store = this.requireStore();
    /*
      Rendered in the browser, not saved to disk.

      Someone checking whether a payslip is right wants to LOOK at it. Forcing a
      download made that a three-step errand — save, open, delete — and left a
      copy of a confidential document in everybody's Downloads folder, which is
      the last place it should accumulate.

      Inline is safe only because of what this product accepts: PDF, PNG and
      JPEG are inert. HTML and SVG can execute, and neither is in ALLOWED_MIME —
      so the guard is that list, and this must be revisited if anything is ever
      added to it. `canRenderInline` reads the same list rather than repeating
      it, so the two cannot drift apart.

      The content type is sent too: object storage will serve a PDF as
      application/octet-stream given the chance, and a browser handed that saves
      the file no matter what the disposition asked for.
    */
    const url = await this.withStorage('preparing a download', () =>
      store.presignDownload(
        document.storageKey,
        downloadName(document.title, document.mimeType),
        undefined,
        { inline: canRenderInline(document.mimeType), contentType: document.mimeType },
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      // First open only. Overwriting it on every read would lose the one fact
      // that matters for delivery evidence: when they first saw it.
      if (isSelf && document.firstOpenedAt === null) {
        await tx.document.update({
          where: { id: document.id },
          data: { firstOpenedAt: new Date() },
        });
      }
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'OPENED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
    });

    return { url, fileName: downloadName(document.title, document.mimeType) };
  }

  /** The evidence trail for one document. */
  async listEvents(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, userId: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const isSelf = document.userId === data.actor.userId;
    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new ForbiddenException('You cannot see other members’ documents');
    }

    return this.prisma.documentEvent.findMany({
      where: { documentId: document.id },
      orderBy: { at: 'asc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Everything in a member's file, for them to take away.
   *
   * GDPR portability, and cheap to build now because the alternative is
   * assembling it by hand under a thirty-day deadline. Returns a manifest plus
   * one short-lived link per document — not the bytes, because a fifty-document
   * archive assembled in a Node process is exactly the thing the rest of this
   * feature refuses to do.
   *
   * SELF ONLY unless the caller may open other members' documents. A subject
   * access request is about YOUR data; someone else's export is their file.
   */
  async exportForMember(data: {
    actor: DocumentActor;
    targetUserId?: string;
    ctx?: RequestContext;
  }) {
    const targetUserId = data.targetUserId ?? data.actor.userId;
    const isSelf = targetUserId === data.actor.userId;
    if (!isSelf && !data.actor.canOpenMemberDocuments) {
      throw new ForbiddenException('You cannot export other members’ documents');
    }
    const store = this.requireStore();

    const documents = await this.prisma.document.findMany({
      where: {
        organizationId: data.actor.organizationId,
        userId: targetUserId,
        status: { not: 'DRAFT' },
      },
      include: {
        type: { select: { key: true, label: true, direction: true } },
        // The whole chain, oldest first: an export of somebody's file should
        // carry every signature the document collected, not just the last.
        signatures: {
          select: { signedAt: true, hashAfter: true },
          orderBy: { signedAt: 'asc' },
        },
      },
      orderBy: [{ issuedAt: 'asc' }],
    });

    const files = [];
    for (const d of documents) {
      files.push({
        title: d.title,
        type: d.type.label,
        issuedAt: d.issuedAt,
        periodYear: d.periodYear,
        periodMonth: d.periodMonth,
        status: d.status,
        sizeBytes: d.sizeBytes,
        // The hash is included so the recipient can verify later that what they
        // downloaded is what the record says it was.
        sha256: d.sha256,
        signedAt: d.signatures[0]?.signedAt ?? null,
        url: await this.withStorage('preparing an export', () =>
          store.presignDownload(
            d.storageKey,
            downloadName(d.title, d.mimeType),
            // Longer than a single open: a person downloading fifty files needs
            // more than a minute, and this link was minted for them by name.
            15 * 60,
          ),
        ),
      });
    }

    // Recorded like any other read, against every document in the export.
    if (files.length > 0) {
      await this.prisma.documentEvent.createMany({
        data: documents.map((d) => ({
          documentId: d.id,
          type: 'DOWNLOADED' as const,
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        })),
      });
    }

    return { exportedAt: new Date(), count: files.length, files };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Withdrawing
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Withdraw a document from a member.
   *
   * Marks it REVOKED; it does NOT delete the row or the object. A signed
   * contract that could be erased by the party who issued it would be worth
   * nothing as evidence — which is exactly what makes deletion the wrong verb
   * here. Actual removal happens through retention, on a schedule, per type.
   */
  async revoke(data: { actor: DocumentActor; documentId: string; ctx?: RequestContext }) {
    this.assertCanIssue(data.actor);

    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (document.status === 'SIGNED') {
      throw new BadRequestException(
        'A signed document cannot be withdrawn. Issue a superseding version instead.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: document.id },
        data: { status: 'REVOKED' },
      });
      await tx.documentEvent.create({
        data: {
          documentId: document.id,
          type: 'REVOKED',
          actorId: data.actor.userId,
          ...eventContext(data.ctx),
        },
      });
      return updated;
    });
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

    if (!memberMayDelete(document.type.direction)) {
      throw new ForbiddenException('This document was issued to you and cannot be removed');
    }

    await this.prisma.document.delete({ where: { id: document.id } });

    // The object is left in place deliberately: it is content-addressed, so
    // another member's identical file may point at the same bytes. Orphans are
    // collected by the retention sweep, which can see the whole picture.
    return { success: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Internals
  // ══════════════════════════════════════════════════════════════════════════

  private assertCanIssue(actor: DocumentActor) {
    if (!actor.canIssueDocuments) {
      throw new ForbiddenException('You cannot issue documents');
    }
  }

  private assertCanManageTypes(actor: DocumentActor) {
    if (!actor.canManageDocumentTemplates) {
      throw new ForbiddenException('You cannot manage document types');
    }
  }

  /**
   * A document this caller may sign, or a refusal.
   *
   * SELF ONLY, and not negotiable. No permission grants the right to sign on
   * somebody else's behalf — that is the one thing a signature cannot survive,
   * and there is deliberately no flag anywhere that could be set to allow it.
   */
  /**
   * The document this caller may sign right now, and the step they are signing.
   *
   * Two shapes, and the difference is the whole of Phase 2:
   *
   *   NO ROUTE   the document's own member signs it, and nobody else. This is
   *              every document issued before routes existed and every type
   *              that never gets one, so it is scoped in the WHERE clause as
   *              before — a colleague's id is NOT FOUND rather than refused.
   *
   *   A ROUTE    the person being waited on signs it, who is usually not the
   *              document's subject. Their manager signing a time sheet is the
   *              entire point. Turn is decided by the chain, so the query
   *              cannot be scoped to the caller and the refusal is explicit.
   *
   * Signing out of turn is refused rather than queued. A signature means "I
   * agree with what is above my name", and above the manager's name is supposed
   * to be the worker's signature — collecting them in any order would make the
   * order on the page a decoration.
   */
  private async findSignableOr404(actor: DocumentActor, documentId: string) {
    const steps = await this.signerSteps(documentId);

    if (steps.length > 0) {
      const next = nextPendingStep(steps);
      if (!next) throw new BadRequestException('This document has already been signed.');
      if (!maySignStep(next, actor.userId)) {
        throw new ForbiddenException('This document is waiting for somebody else to sign.');
      }
    }

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
        // With a route, turn decides who may sign and the chain was just
        // checked. Without one, the caller must be the subject — scoped here so
        // a colleague's id is not found rather than found-and-refused.
        ...(steps.length > 0 ? {} : { userId: actor.userId }),
      },
      include: {
        type: { select: { label: true, signatureMode: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        organization: { select: { name: true } },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (document.status === 'SIGNED') {
      throw new BadRequestException('This document has already been signed.');
    }
    if (document.status !== 'AWAITING_SIGNATURE') {
      throw new BadRequestException('This document is not waiting for a signature.');
    }
    return document;
  }

  /**
   * Reject a template body that could not produce a usable contract.
   *
   * Checked when the template is SAVED, not when it is issued: an administrator
   * writing it can fix a typo immediately, whereas the same error surfacing
   * during an onboarding batch blocks somebody's first day.
   */
  private assertTemplateBodyIsUsable(body: string) {
    if (!body.trim()) throw new BadRequestException('A template needs a body');

    const unknown = unknownTokens(body);
    if (unknown.length > 0) {
      throw new BadRequestException(
        `This template refers to fields that do not exist: ${unknown.join(', ')}`,
      );
    }
  }

  private async findTypeOr404(id: string, organizationId: string) {
    const type = await this.prisma.documentType.findFirst({
      where: { id, organizationId },
    });
    if (!type) throw new NotFoundException('Document type not found');
    return type;
  }

  /**
   * The tenant check every write goes through.
   *
   * Returns the member so callers that need their name for a notification do
   * not fetch them twice.
   */
  private async assertMemberOfOrg(userId: string, organizationId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  /**
   * Tell the member a document is waiting.
   *
   * Fire-and-forget: a notification service that is down must not fail the
   * issue. The document exists either way, and delivery is recorded separately
   * — which is why `deliveredAt` is set by the notification path, not here.
   */
  /**
   * Tell whoever the document is now waiting for.
   *
   * Marks the step notified so the register can say how long it has been
   * sitting — "waiting on Anna, 4 days" is the question that screen exists to
   * answer, and it needs a start time.
   *
   * Swallows its own failure. Push is best-effort, and an exception here would
   * surface to the signer as though their signature had failed when it is
   * already sealed.
   */
  private async notifyNextSigner(documentId: string, title: string): Promise<void> {
    try {
      const steps = await this.signerSteps(documentId);
      const next = nextPendingStep(steps);
      if (!next) return;

      /*
        A client is told by email, not by push.

        They have no device registered here and no socket open — the only way to
        reach them is the address on their record. Marking them as owing a
        notification rather than sending one here is what makes eleven time
        sheets issued at 09:00 arrive as ONE email: the sweep collects
        everything outstanding per client and sends once.
      */
      if (!next.userId && next.customerId) {
        await this.prisma.documentSigner.updateMany({
          where: { documentId, order: next.order, notifiedAt: null },
          data: { notifiedAt: new Date() },
        });
        return;
      }

      /*
        Tell EVERYONE the step is open to.

        A step with three eligible leaders is waiting on all three until one of
        them acts, so telling only the first would make the other two wonder why
        a document appeared on their list unannounced — and would quietly make
        the first person the responsible after all.
      */
      const audience = next.eligibleUserIds?.length
        ? next.eligibleUserIds
        : next.userId
        ? [next.userId]
        : [];
      if (audience.length === 0) return; // A step nobody can be told about.

      const [users, signerRow, document] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: audience } },
          select: { id: true, firstName: true, email: true },
        }),
        this.prisma.documentSigner.findFirst({
          where: { documentId, order: next.order },
          select: { id: true },
        }),
        // Whose document it is. "A time sheet needs your signature" is not
        // actionable to a manager with nine people; "Mike's time sheet" is.
        this.prisma.document.findUnique({
          where: { id: documentId },
          select: { user: { select: { firstName: true, lastName: true } } },
        }),
      ]);
      if (users.length === 0) return;

      if (signerRow) {
        await this.prisma.documentSigner.update({
          where: { id: signerRow.id },
          data: { notifiedAt: new Date() },
        });
      }

      for (const user of users) this.notificationClient.emit('document_awaiting_signature', {
        documentId,
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        title,
        memberName: document?.user
          ? `${document.user.firstName} ${document.user.lastName}`.trim()
          : undefined,
        step: next.order,
        totalSteps: steps.length,
      });
    } catch (err) {
      this.logger.warn(`Could not notify the next signer of ${documentId}: ${String(err)}`);
    }
  }

  private notifyIssued(
    documentId: string,
    member: { id: string; firstName: string; lastName: string; email: string },
    typeLabel: string,
    title: string,
    needsSignature: boolean,
  ) {
    try {
      this.notificationClient.emit('document_issued', {
        documentId,
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        typeLabel,
        title,
        // The handler sends a different message for each: "needs your
        // signature" is an instruction, "is ready" is information, and
        // conflating them trains people to ignore both.
        needsSignature,
      });
    } catch (err) {
      this.logger.warn(`Could not queue notification for document ${documentId}: ${(err as Error).message}`);
    }
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

/**
 * The consent a member gives before signing.
 *
 * A single constant, stored verbatim on every signature and printed on the
 * certificate page. If the wording ever changes, past signatures keep the words
 * that were actually shown — which is the only version worth having on a record.
 */
export const CONSENT_TEXT =
  'I have read this document and agree to sign it electronically.';

/** Merge-field values for one member. */
function contractValues(
  member: {
    firstName: string; lastName: string; email: string;
    position: string | null; specialty: string | null;
    employmentStartDate: Date | null;
    organization: {
      name: string; addressLine1: string | null; city: string | null;
      postalCode: string | null; country: string | null;
      email: string | null; phone: string | null;
    } | null;
  },
  contract: { startDate?: string; weeklyHours?: number | string } | undefined,
  issuedAt: Date,
): Record<string, string | number | null> {
  const org = member.organization;
  const address = [org?.addressLine1, [org?.postalCode, org?.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  const startDate =
    contract?.startDate ?? (member.employmentStartDate ? isoDate(member.employmentStartDate) : null);

  return {
    'member.fullName': `${member.firstName} ${member.lastName}`.trim(),
    'member.firstName': member.firstName,
    'member.lastName': member.lastName,
    'member.email': member.email,
    'member.jobTitle': member.position,
    'member.specialty': member.specialty,
    'org.legalName': org?.name ?? null,
    'org.address': address || null,
    'org.country': org?.country ?? null,
    'org.email': org?.email ?? null,
    'org.phone': org?.phone ?? null,
    // Space fields resolve to null for now — a member belongs to spaces, not to
    // one space, and picking arbitrarily would put the wrong site on a contract.
    'space.name': null,
    'space.address': null,
    'contract.startDate': startDate,
    'contract.weeklyHours': contract?.weeklyHours ?? null,
    'contract.issuedOn': isoDate(issuedAt),
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Turn the signature pad's output into PNG bytes.
 *
 * The pad hands back a data URL. It is decoded and checked here rather than
 * stored as-is, because a base64 string in a database column is the mistake
 * three other signature fields in this schema already make — and because the
 * bytes have to be real for the seal to embed them.
 */
function decodeSignaturePng(dataUrl: string): Buffer {
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
function normaliseKey(raw: string): string {
  return documentTypeKey(raw);
}

/** A staging-key suffix. Not an id — nothing is stored under it. */
function cuidish(): string {
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
function canRenderInline(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, mimeType);
}

/**
 * The word printed beside a signature in the block.
 *
 * Three marks in a column are indistinguishable without it — and "MEMBER" is
 * the schema's word, not one anybody reading a time sheet would use.
 */
function roleLabel(role: string | null): string {
  switch (role) {
    case 'MEMBER': return 'Member';
    case 'RESPONSIBLE': return 'Responsible';
    case 'ORG_REPRESENTATIVE': return 'For the company';
    case 'CUSTOMER': return 'Customer';
    // A document with no route has one signature and nothing to distinguish.
    default: return 'Signed by';
  }
}

function downloadName(title: string, mimeType: string): string {
  const ext = ALLOWED_MIME[mimeType] ?? 'pdf';
  const safe = title.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120) || 'document';
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

/** Request provenance, flattened onto an event row. */
function eventContext(ctx?: RequestContext) {
  return {
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    appVersion: ctx?.appVersion ?? null,
    lat: ctx?.lat ?? null,
    lng: ctx?.lng ?? null,
  };
}
