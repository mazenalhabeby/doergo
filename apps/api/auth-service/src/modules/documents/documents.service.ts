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
} from '@hbcfield/shared';
// Node-only: pulls the AWS SDK, so it lives behind its own subpath rather than
// the root export. Services that never touch object storage stay free of it.
import { ObjectStore, documentKey, signatureKey, sha256 } from '@hbcfield/shared/storage';
import { renderContractPdf, sealSignedPdf } from './contract-pdf';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OBJECT_STORE } from './object-store.provider';

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

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
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
      isActive: boolean;
      position: number;
    }>;
  }) {
    this.assertCanManageTypes(data.actor);
    const existing = await this.findTypeOr404(data.id, data.actor.organizationId);

    // `cadence` and `direction` are absent from the patch on purpose. Changing
    // either would re-interpret every document already filed under the type —
    // a MONTHLY type turned ONE_OFF orphans twelve rows a year from their
    // period, and flipping direction would hand members a delete button for
    // payslips. Make a new type instead.
    return this.prisma.documentType.update({
      where: { id: existing.id },
      data: data.patch,
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

    const extension = ALLOWED_MIME[data.mimeType];
    if (!extension) {
      throw new BadRequestException(
        `${data.mimeType} cannot be filed. Accepted: PDF, PNG, JPEG.`,
      );
    }
    if (!Number.isFinite(data.sizeBytes) || data.sizeBytes <= 0) {
      throw new BadRequestException('A file size is required');
    }
    if (data.sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException(
        `That file is larger than the ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`,
      );
    }

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

    // The staging key came back from the client, so it is untrusted input and
    // is the one place a caller could try to reach another tenant's objects.
    // Checked before the store is even required, so a misconfigured server
    // cannot turn a refusal into a different error.
    const prefix = `${data.actor.organizationId}/documents/_staging/`;
    if (!data.stagingKey.startsWith(prefix) || data.stagingKey.includes('..')) {
      throw new ForbiddenException('That upload does not belong to your organization');
    }

    const store = this.requireStore();

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

    const head = await this.withStorage('checking an upload', () => store.head(data.stagingKey));
    if (!head.exists) {
      throw new BadRequestException('The upload did not complete — please try again');
    }
    if (head.sizeBytes > MAX_DOCUMENT_BYTES) {
      await store.delete(data.stagingKey);
      throw new BadRequestException('That file is larger than the limit');
    }

    const bytes = await this.withStorage('reading an upload', () => store.get(data.stagingKey));
    const hash = sha256(bytes);
    const mimeType = head.contentType ?? 'application/pdf';
    const extension = ALLOWED_MIME[mimeType] ?? 'pdf';
    const finalKey = documentKey(data.actor.organizationId, hash, extension);

    // Content-addressed, so re-putting identical bytes is a no-op that costs
    // one round trip. The same policy issued to thirty people is one object.
    await this.withStorage('filing a document', () => store.put(finalKey, bytes, mimeType));
    await store.delete(data.stagingKey);

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
          storageKey: finalKey,
          sha256: hash,
          sizeBytes: bytes.length,
          mimeType,
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

    const position = data.position?.trim().toLowerCase() || null;
    const score = (t: (typeof candidates)[number]): number => {
      const roleMatches = !!t.appliesToRoleId && t.appliesToRoleId === data.roleId;
      const posMatches =
        !!t.appliesToPosition && !!position && t.appliesToPosition.trim().toLowerCase() === position;

      // A template naming a role or a position that does NOT match is not a
      // fallback — it is a template for somebody else.
      if (t.appliesToRoleId && !roleMatches) return -1;
      if (t.appliesToPosition && !posMatches) return -1;

      if (roleMatches && posMatches) return 3;
      if (roleMatches) return 2;
      if (posMatches) return 1;
      return 0; // binds to nothing: the organization default
    };

    const best = candidates
      .map((t) => ({ t, s: score(t) }))
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

    const store = this.requireStore();
    const document = await this.findSignableOr404(data.actor, data.documentId);

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

    // The document as the signer read it. Fetched and hashed here rather than
    // trusting the stored value, so an object swapped underneath us is caught
    // BEFORE a signature is attached to it.
    const originalBytes = await this.withStorage('reading the document to sign', () =>
      store.get(document.storageKey),
    );
    const hashBefore = sha256(originalBytes);
    if (hashBefore !== document.sha256) {
      throw new BadRequestException(
        'This document has changed since it was issued and cannot be signed. Please contact your administrator.',
      );
    }

    const signatureHash = sha256(png);
    const sigKey = signatureKey(data.actor.organizationId, signatureHash);
    await this.withStorage('storing the signature', () => store.put(sigKey, png, 'image/png'));

    const consentAt = new Date();
    const signedAt = new Date();

    const sealed = await sealSignedPdf(originalBytes, {
      documentTitle: document.title,
      signerName: `${document.user.firstName} ${document.user.lastName}`.trim(),
      signerEmail: document.user.email,
      organizationName: document.organization?.name ?? '',
      consentText: CONSENT_TEXT,
      consentAt,
      signedAt,
      hashBefore,
      sessionAuthenticatedAt: data.sessionAuthenticatedAt
        ? new Date(data.sessionAuthenticatedAt)
        : null,
      ip: data.ctx?.ip ?? null,
      userAgent: data.ctx?.userAgent ?? null,
      appVersion: data.ctx?.appVersion ?? null,
      lat: data.ctx?.lat ?? null,
      lng: data.ctx?.lng ?? null,
      signatureImage: png,
      signatureSha256: signatureHash,
    });

    const hashAfter = sha256(sealed);
    const sealedKey = documentKey(data.actor.organizationId, hashAfter, 'pdf');
    await this.withStorage('sealing the document', () => store.put(sealedKey, sealed, 'application/pdf'));

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: {
          storageKey: sealedKey,
          sha256: hashAfter,
          sizeBytes: sealed.length,
          status: 'SIGNED',
        },
      });
      await tx.documentSignature.create({
        data: {
          documentId: document.id,
          userId: data.actor.userId,
          signatureKey: sigKey,
          signatureSha256: signatureHash,
          consentText: CONSENT_TEXT,
          consentAt,
          signedAt,
          hashBefore,
          hashAfter,
          sealedAt: new Date(),
          idempotencyKey: data.idempotencyKey,
        },
      });
      for (const type of ['SIGNED', 'SEALED'] as const) {
        await tx.documentEvent.create({
          data: {
            documentId: document.id,
            type,
            actorId: data.actor.userId,
            ...eventContext(data.ctx),
          },
        });
      }
    });

    // The original object is deliberately left in place. It is what the signer
    // read, it is content-addressed so nothing else can claim its key, and the
    // certificate page cites its hash — deleting it would remove the only copy
    // the before-hash describes.
    return { documentId: document.id, alreadySigned: false, sealedAt: new Date() };
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
      where: { organizationId: data.actor.organizationId, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /** Everything staged and not yet released, with who it is for. */
  async listDrafts(data: { actor: DocumentActor }) {
    this.assertCanIssue(data.actor);
    return this.prisma.document.findMany({
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
        type: { select: { id: true, label: true, signatureMode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
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
  async publishBatch(data: { actor: DocumentActor; documentIds: string[]; ctx?: RequestContext }) {
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
        type: { select: { label: true, signatureMode: true } },
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
        type: { select: { key: true, label: true, signatureMode: true, isCredential: true } },
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

    const now = new Date();
    return documents.map((d) => ({
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
      needsSignature: d.status === 'AWAITING_SIGNATURE',
      standing: d.type.isCredential ? credentialStanding(d.expiresOn, now) : null,
    }));
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
    if (!isSelf && !data.actor.canOpenMemberDocuments) {
      // Distinct from the list permission on purpose: a dispatcher may need to
      // know a certificate exists and expires on Friday without being able to
      // open a colleague's payslip.
      throw new ForbiddenException('You cannot open other members’ documents');
    }

    const store = this.requireStore();
    const url = await this.withStorage('preparing a download', () =>
      store.presignDownload(document.storageKey, downloadName(document.title, document.mimeType)),
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
  private async findSignableOr404(actor: DocumentActor, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: actor.organizationId,
        // Scoped to the caller in the WHERE clause, so an id belonging to a
        // colleague is not found rather than found-and-refused.
        userId: actor.userId,
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
function normaliseKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** A staging-key suffix. Not an id — nothing is stored under it. */
function cuidish(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** What the browser should call the saved file. */
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
