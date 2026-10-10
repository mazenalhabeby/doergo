/**
 * The personnel file's shared vocabulary: who the caller is, the visibility
 * rules every read answers, and the small pure helpers more than one part of
 * the documents service needs.
 *
 * Pure on purpose — nothing here touches the database or storage, so every
 * collaborator can use it without a dependency on any other.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  visibleDocumentWhere,
  documentVisibleTo,
  documentTypeKey,
  type DocumentSignerRole,
  toISODateString,
} from '@hbcfield/shared';

/** What a caller is allowed to do, resolved by the gateway from their access. */
export interface DocumentActor {
  /**
   * Works for a client or partner, not for this organization.
   *
   * The personnel file is the one area where the answer is a relationship
   * rather than a permission: we ask somebody else's employee for nothing, and
   * we accept nothing from them either.
   */
  isExternal?: boolean;
  userId: string;
  organizationId: string;
  canViewMemberDocuments: boolean;
  canOpenMemberDocuments: boolean;
  canIssueDocuments: boolean;
  canManageDocumentTemplates: boolean;
  /** The member's org-wide role — a document TYPE may name the roles that see it. */
  roleId?: string | null;
  /** An administrator sees every type. */
  isAdmin?: boolean;
  /*
    Control over one document. Optional so every existing caller that builds an
    actor by hand fails CLOSED: absent is false.
  */
  canManageDocumentVisibility?: boolean;
  canReplaceDocuments?: boolean;
  canDeleteDocuments?: boolean;
}

/** Request provenance, recorded on every evidence-trail entry. */
/**
 * The type-visibility scope for a read that shows OTHER people's documents.
 *
 * A document type may name the roles that can see it. This is that rule as a
 * `where` fragment, from the one implementation in shared — spread into a query
 * rather than filtered afterwards, so the COUNT and the pagination describe rows
 * the reader can actually see. Filtering a fetched page renders twenty as four
 * and reports the total as twenty.
 *
 * ⚠️ Never applied to somebody's OWN documents. You always see your own file
 * whatever its types contain; this restricts who may look at somebody else's.
 *
 * Returns `undefined` for an administrator, so their queries are untouched.
 */
/**
 * Refuse one document whose TYPE this reader may not see.
 *
 * ⚠️ 404, not 403. "You may not see this payslip" confirms the payslip exists
 * and roughly what it says — which is most of what a payslip discloses. The
 * register does not list it, so nothing else should admit to it either.
 *
 * Never applied to the reader's own document.
 */
/**
 * Refuse one document whose TYPE this caller may not see.
 *
 * Two exemptions, both of them the point rather than a loophole:
 *
 *  - The subject. A restriction decides who may read other people's documents;
 *    it never hides a person's own file from them.
 *  - A routed signer. Being asked to sign a document IS the authorisation to
 *    read that one document — a shift leader countersigning a time sheet is not
 *    in HR, and signing something you cannot read is the one outcome a signing
 *    feature must never produce.
 *
 * 404 rather than 403 on purpose: to a reader who may not see the type, the
 * document is not something they are being refused, it is something that is not
 * there. A 403 would confirm that a payslip exists for that person on that date.
 */
export function assertTypeVisible(
  actor: DocumentActor,
  doc: {
    userId: string;
    hiddenFromMember?: boolean | null;
    rolesOverridden?: boolean | null;
    visibleToRoleIds?: string[] | null;
    type?: { visibleToRoleIds?: string[] | null } | null;
  },
  routedSigner = false,
): void {
  // A routed signer reads the one document they were asked to sign — unless it
  // is their OWN and was hidden from them, which is the one case where being on
  // the route is not enough: hiding it from them is the instruction.
  if (routedSigner && !(doc.userId === actor.userId && doc.hiddenFromMember)) return;
  if (
    documentVisibleTo(doc, {
      roleId: actor.roleId ?? null,
      isAdmin: !!actor.isAdmin,
      userId: actor.userId,
    })
  ) {
    return;
  }
  throw new NotFoundException('Document not found');
}

/**
 * The type restriction as a `where` fragment, for every list of documents.
 *
 * Spread it — it is `undefined` for an unrestricted reader and adds nothing to
 * the query in the common case. It carries the caller's own id, so a member's
 * own documents stay in every list they appear in; a restriction decides whose
 * OTHER documents you may read.
 */
export function typeScope(actor: DocumentActor) {
  // Named for history: it now scopes by the TYPE and by the document's own
  // override (hidden from its member, or limited to roles). One fragment, so no
  // list can apply one rule and forget the other.
  return visibleDocumentWhere({
    roleId: actor.roleId ?? null,
    isAdmin: !!actor.isAdmin,
    userId: actor.userId,
  });
}

/**
 * An unpublished DRAFT is a staged batch — not yet anybody's document.
 *
 * Every list already leaves drafts out, but a by-id read let the SUBJECT open
 * their own draft (the subject exemption admitted it): a payslip still being
 * corrected, before payroll pressed Publish. Until it is published only the
 * people who stage documents see it. 404, like every refusal here.
 */
export function maySeeDrafts(actor: DocumentActor): boolean {
  return !!actor.isAdmin || !!actor.canIssueDocuments;
}
export function assertNotHiddenDraft(actor: DocumentActor, doc: { status?: string | null }): void {
  if (doc.status === 'DRAFT' && !maySeeDrafts(actor)) throw new NotFoundException('Document not found');
}

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Uploads are capped well below anything that would strain a phone or a bill. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * What a client's signing link may show AND open. One list for both: a list
 * and a file route that disagree are how a revoked document stays downloadable.
 */
export const CUSTOMER_LINK_STATUSES = ['AWAITING_SIGNATURE', 'SIGNED'] as const;

/**
 * How long a staged batch is kept before it counts as abandoned.
 *
 * A week, so an admin who staged a batch on Friday and came back on Monday
 * finds it waiting. Shorter would delete work somebody meant to finish; much
 * longer and the point is lost, since nothing else ever removes these.
 */
export const ABANDONED_DRAFT_DAYS = 7;

/**
 * What may be filed. Deliberately a short allow-list rather than a deny-list:
 * this store holds employment records, not arbitrary user content, and every
 * type here renders in a viewer without executing anything.
 */
export const ALLOWED_MIME: Record<string, string> = {
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
export type SealSigner =
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

// ── Rules about the caller, shared by every part of the personnel file ──────

/**
 * The two questions every upload has to answer before a byte moves.
 *
 * Shared by the administrator's path and the member's, because a limit that
 * only one of them honours is not a limit. Returns the extension so the
 * caller does not look it up a second time.
 */
export function assertUploadable(mimeType: string, sizeBytes: number): string {
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
 * A member's own staging folder.
 *
 * Per-user, not per-organization. The administrator's prefix is shared by
 * everyone who can issue, which is fine because they may file to anybody;
 * a member may file only to themselves, so their confirm step must be unable
 * to name an object anybody else staged.
 */
export function ownStagingPrefix(organizationId: string, userId: string): string {
  return `${organizationId}/documents/_staging/u/${userId}/`;
}

/** Where anyone who may issue stages a file, for anybody in the organization. */
export function sharedStagingPrefix(organizationId: string): string {
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
export function assertStagingKey(stagingKey: string, prefix: string) {
  if (!stagingKey.startsWith(prefix) || stagingKey.includes('..')) {
    throw new ForbiddenException('That upload does not belong to you');
  }
}

/**
 * Nobody vouches for their own paperwork.
 *
 * ⚠️ A member who can issue documents could otherwise approve their own
 * expired licence, or file their own "certificate" straight to ISSUED and
 * past the dispatch gate. Administrators excepted — in a one-person
 * organization there is nobody else to ask.
 */
export function assertNotOwnReview(actor: DocumentActor, subjectUserId: string) {
  if (actor.isAdmin) return;
  if (subjectUserId === actor.userId) {
    throw new ForbiddenException('Somebody else has to review your own documents');
  }
}

export function assertCanIssue(actor: DocumentActor) {
  if (!actor.canIssueDocuments) {
    throw new ForbiddenException('You cannot issue documents');
  }
}

export function assertCanManageTypes(actor: DocumentActor) {
  if (!actor.canManageDocumentTemplates) {
    throw new ForbiddenException('You cannot manage document types');
  }
}

/** Who may see documents — per document or per type, one permission. */
export function assertCanManageVisibility(actor: DocumentActor) {
  if (actor.isAdmin) return;
  if (!actor.canManageDocumentVisibility || actor.isExternal) {
    throw new ForbiddenException('You cannot change who sees documents');
  }
}

/**
 * The consent a member gives before signing.
 *
 * A single constant, stored verbatim on every signature and printed on the
 * certificate page. If the wording ever changes, past signatures keep the words
 * that were actually shown — which is the only version worth having on a record.
 */
export const CONSENT_TEXT =
  'I have read this document and agree to sign it electronically.';

/**
 * The company a contract names as the employer: the member's own (Settings › Companies), else the
 * organization's main company. One select for every place that builds merge values.
 */
export const EMPLOYER_COMPANY_SELECT = {
  legalName: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, state: true,
  country: true, email: true, phone: true, vatId: true, taxId: true, registerNumber: true,
} as const;

export type EmployerCompany = {
  legalName: string; addressLine1: string | null; addressLine2: string | null; postalCode: string | null;
  city: string | null; state: string | null; country: string | null; email: string | null; phone: string | null;
  vatId: string | null; taxId: string | null; registerNumber: string | null;
};

/** Merge-field values for one member. */
export function contractValues(
  member: {
    firstName: string; lastName: string; email: string;
    position: string | null; specialty: string | null;
    employmentStartDate: Date | null;
    employerEntity?: EmployerCompany | null;
    organization: {
      name: string; addressLine1: string | null; city: string | null;
      postalCode: string | null; country: string | null;
      email: string | null; phone: string | null;
      legalEntities?: EmployerCompany[];
    } | null;
  },
  contract: ContractTerms | undefined,
  issuedAt: Date,
  /**
   * What was read off the member's own ID document, and who is issuing.
   *
   * Both are LOOKED UP rather than typed. A passport number retyped into a
   * letter is a letter that reaches a border with a digit wrong, and a signer's
   * name typed into a template body goes stale the day that person changes
   * role — on every document already issued from it.
   */
  extra?: {
    identity?: { documentNumber: string | null; issuingState: string | null } | null;
    issuer?: { firstName: string; lastName: string; position: string | null } | null;
  },
): Record<string, string | number | null> {
  const org = member.organization;
  /*
    ⚠️ THE EMPLOYER IS A COMPANY, not the organization. HBC USA's people are employed by HBC USA
    Inc., not by the Austrian GmbH that shares their workspace — a contract naming the wrong legal
    entity is a contract with the wrong party. Their own company, else the main one, else the
    organization profile (an organization from before companies existed).
  */
  const company = member.employerEntity ?? org?.legalEntities?.[0] ?? null;
  const address = company
    ? [company.addressLine1, company.addressLine2, [company.postalCode, company.city].filter(Boolean).join(' '), company.state]
        .filter(Boolean)
        .join(', ')
    : [org?.addressLine1, [org?.postalCode, org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const startDate =
    contract?.startDate ?? (member.employmentStartDate ? toISODateString(member.employmentStartDate) : null);

  return {
    'member.fullName': `${member.firstName} ${member.lastName}`.trim(),
    'member.firstName': member.firstName,
    'member.lastName': member.lastName,
    'member.email': member.email,
    'member.jobTitle': member.position,
    'member.specialty': member.specialty,
    'org.legalName': company?.legalName ?? org?.name ?? null,
    'org.address': address || null,
    'org.country': company?.country ?? org?.country ?? null,
    'org.email': company?.email ?? org?.email ?? null,
    'org.phone': company?.phone ?? org?.phone ?? null,
    'org.vatId': company?.vatId ?? null,
    'org.taxId': company?.taxId ?? null,
    'org.registerNumber': company?.registerNumber ?? null,
    // Space fields resolve to null for now — a member belongs to spaces, not to
    // one space, and picking arbitrarily would put the wrong site on a contract.
    'space.name': null,
    'space.address': null,
    'member.passportNumber': extra?.identity?.documentNumber ?? null,
    'member.nationality': extra?.identity?.issuingState ?? null,
    'contract.startDate': startDate,
    'contract.weeklyHours': contract?.weeklyHours ?? null,
    'contract.issuedOn': toISODateString(issuedAt),
    'contract.endDate': contract?.endDate ?? null,
    'contract.siteName': contract?.siteName ?? null,
    'contract.siteAddress': contract?.siteAddress ?? null,
    'contract.rotation': contract?.rotation ?? null,
    'issuer.fullName': extra?.issuer
      ? `${extra.issuer.firstName} ${extra.issuer.lastName}`.trim()
      : null,
    'issuer.jobTitle': extra?.issuer?.position ?? null,
  };
}

/** Terms that are not on the member record and are supplied at issue time. */
export interface ContractTerms {
  startDate?: string;
  weeklyHours?: number | string;
  endDate?: string;
  siteName?: string;
  siteAddress?: string;
  rotation?: string;
}


/**
 * Turn the signature pad's output into PNG bytes.
 *
 * The pad hands back a data URL. It is decoded and checked here rather than
 * stored as-is, because a base64 string in a database column is the mistake
 * three other signature fields in this schema already make — and because the
 * bytes have to be real for the seal to embed them.
 */
export function decodeSignaturePng(dataUrl: string): Buffer {
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
export function normaliseKey(raw: string): string {
  return documentTypeKey(raw);
}

/** A staging-key suffix. Not an id — nothing is stored under it. */
export function cuidish(): string {
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
export function canRenderInline(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, mimeType);
}

/**
 * The word printed beside a signature in the block.
 *
 * Three marks in a column are indistinguishable without it — and "MEMBER" is
 * the schema's word, not one anybody reading a time sheet would use.
 */
export function roleLabel(role: string | null): string {
  switch (role) {
    case 'MEMBER': return 'Member';
    case 'RESPONSIBLE': return 'Responsible';
    case 'ORG_REPRESENTATIVE': return 'For the company';
    case 'CUSTOMER': return 'Customer';
    // A document with no route has one signature and nothing to distinguish.
    default: return 'Signed by';
  }
}

export function downloadName(title: string, mimeType: string): string {
  const ext = ALLOWED_MIME[mimeType] ?? 'pdf';
  const safe = title.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120) || 'document';
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

/** Request provenance, flattened onto an event row. */
/**
 * The ids a bulk action may touch: de-duplicated, non-empty, at most 100.
 * A cap keeps one request from turning into an unbounded transaction.
 */
export function boundedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new BadRequestException('documentIds must be a list');
  const out = [...new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64))];
  if (out.length === 0) throw new BadRequestException('Choose at least one document');
  if (out.length > 100) throw new BadRequestException('At most 100 documents at a time');
  if (out.length !== ids.length && new Set(ids).size === ids.length) {
    throw new BadRequestException('documentIds must be document ids');
  }
  return out;
}

export function eventContext(ctx?: RequestContext) {
  return {
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    appVersion: ctx?.appVersion ?? null,
    lat: ctx?.lat ?? null,
    lng: ctx?.lng ?? null,
  };
}

/** Two id lists naming the same set, whatever their order. */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}
