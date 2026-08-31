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
        select: { id: true, title: true, typeId: true, status: true, expiresOn: true },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const statuses = requirementStatuses(member, types, held);

    return {
      // Both filtered with the shared rules, so this agrees with the member's
      // own documents screen rather than offering a second opinion.
      toUpload: statuses.filter((r) => waitingOnMember(r)),
      expiring: statuses.filter((r) => r.state === 'EXPIRING'),
      toSign: held
        .filter((d) => d.status === 'AWAITING_SIGNATURE')
        .map((d) => ({ id: d.id, title: d.title })),
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
      /*
        CONSENTED is written here too, if it is not already on the trail.

        `recordConsent` writes it when the client walks the flow properly, and
        both clients do. But a complete legal record must not depend on a client
        having made an extra call: the consent text and time are stored on the
        signature either way, so a trail missing the entry would contradict the
        certificate page printed from the same row.

        Idempotent by construction — a client that DID call consent leaves one
        entry, not two.
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
            actorId: data.actor.userId,
            ...(type === 'CONSENTED' ? { meta: { text: CONSENT_TEXT } } : {}),
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
        rejectionReason: true,
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
        signature: { select: { signedAt: true, hashAfter: true } },
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
        signedAt: d.signature?.signedAt ?? null,
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
