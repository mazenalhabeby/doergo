/** Who the caller is, which documents they may see, and the shapes and limits every part shares. */
import { documentVisibleTo, type DocumentSignerRole, visibleDocumentWhere } from '@hbcfield/shared';
import { NotFoundException } from '@nestjs/common';

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
