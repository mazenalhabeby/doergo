import { Injectable } from '@nestjs/common';
import {
  personName,
  notEndedWhere,
  counterpartySourceFor,
  isSelfSigning,
  resolveMemberRouting,
  type DocumentSignerRole,
  PERSON_BRIEF_SELECT,
  memberWorkspacesForRouting,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { type SignerCandidate } from './document-common';

/**
 * Who may sign a step: the candidates for a role (cached per request), and the
 * sentence when nobody can.
 */
@Injectable()
export abstract class DocumentRoutingBase {
  constructor(protected readonly prisma: PrismaService) {}

  /** Why a step cannot be filled, and what to do about it. */
  protected noSignerMessage(role: DocumentSignerRole, order: number): string {
    switch (role) {
      case 'RESPONSIBLE':
        return (
          `Step ${order} needs the person who signs off for this member, and nobody ` +
          `is set. Choose one under “Signs off for …” on their space membership.`
        );
      case 'ORG_REPRESENTATIVE':
        return (
          `Step ${order} needs somebody signing for the organisation, and nobody in it can. Give ` +
          `a member the right to manage people, or remove the step from this document type.`
        );
      case 'SITE_SUPERVISOR':
        return (
          `Step ${order} needs the client's supervisor on a space this member works in, and none is assigned. ` +
          `Invite their supervisor as an external member of that space, or remove the step from this document type.`
        );
      case 'CUSTOMER':
        return (
          `Step ${order} needs the client of a space this member works in, and there is ` +
          `none. Add the client to the space, or remove the step from this document type.`
        );
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
  cachedCandidatesForRole(
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

  protected async candidatesForRole(
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
      !subject || !isSelfSigning(subject, { userId: c.kind === 'USER' ? c.id : null, email: c.email });
    if (role === 'MEMBER') {
      const u = await this.prisma.user.findUnique({
        where: { id: memberId },
        select: PERSON_BRIEF_SELECT,
      });
      return u ? [{ kind: 'USER', id: u.id, name: personName(u), email: u.email }] : [];
    }

    if (role === 'RESPONSIBLE') {
      // allowLeaderDefault false: a space nobody configured contributes no one.
      // Sign-off is not something to fall into by being a space leader.
      const ids = await resolveMemberRouting(this.prisma, organizationId, memberId, 'approve', false);
      ids.delete(memberId); // nobody approves their own hours
      if (ids.size === 0) return [];
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...ids] }, organizationId, isActive: true },
        select: PERSON_BRIEF_SELECT,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const,
          id: u.id,
          name: personName(u),
          email: u.email,
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
        select: PERSON_BRIEF_SELECT,
        take: 50,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const,
          id: u.id,
          name: personName(u),
          email: u.email,
        }))
        .filter(notTheSubject);
    }

    if (role === 'SITE_SUPERVISOR') {
      /*
        The client's own supervisor on the site.

        Resolved through the SPACE, not through the member's routing: this
        signature says "the company whose site this is accepts what happened
        there", and it is the space that names that company. An external member
        is assigned to exactly one space, so their presence on the roster IS
        the claim to represent it.

        `isExternal` is the whole filter — internal colleagues on the same
        roster sign as RESPONSIBLE if anybody, never as the client. One query,
        one join, bounded: the roster of the member's spaces, narrowed to
        external members in the database rather than fetched and filtered here.
      */
      const users = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          isExternal: true,
          id: { not: memberId },
          spaceAssignments: {
            some: {
              organizationId,
              ...notEndedWhere(),
              // The spaces this member works in — the sites their document is about.
              space: {
                spaceAssignments: {
                  some: {
                    userId: memberId,
                    ...notEndedWhere(),
                  },
                },
              },
            },
          },
        },
        select: PERSON_BRIEF_SELECT,
        // Same ceiling the other roles use: a candidate list is a picker, not a
        // report, and an unbounded one is a denial-of-service on the issue screen.
        take: 50,
      });
      return users
        .map((u) => ({
          kind: 'USER' as const,
          id: u.id,
          name: personName(u),
          email: u.email,
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
    const spaces = await memberWorkspacesForRouting(this.prisma, memberId, organizationId);
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
}
