import { Injectable } from '@nestjs/common';
import { notEndedWhere, daysUntil, credentialStanding, visibleDocumentWhere } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** The credential board: every member's required papers, and what is missing, expiring or expired. */
@Injectable()
export class ComplianceBoardService {

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The compliance board: everything an organization needs to chase.
   *
   * One grouped read, not one query per member — a fifty-person organization
   * would otherwise open this screen fifty times over.
   */
  /**
   * Credential validity for the people this caller is responsible for.
   *
   * The board is gated on `canAssignTasks` on purpose — whoever hands out work
   * needs to know WHY somebody dropped out of the assignable pool — and it
   * returns validity and dates, never the certificate itself.
   *
   * That reasoning now has to answer a second question: responsible for WHOM.
   * Assignment became space-aware, so a supervisor who staffs one site was
   * either refused this board entirely or, if let in, handed the credential
   * standing of everybody in the company. The scope narrows it to the people
   * rostered where they assign — undefined for an org-wide holder, and an empty
   * array (granted nowhere) matching nothing rather than everything.
   */
  async listCompliance(data: {
    organizationId: string;
    scopeSpaceIds?: string[];
    /**
     * Who is reading — the gateway's `documentActor(user)` fits. A restricted
     * credential type stays off the board for a reader who may not see it.
     *
     * ⚠️ Absent fails CLOSED: read as a member with no role, who sees only the
     * unrestricted types. Never as an administrator.
     */
    actor?: { userId?: string | null; roleId?: string | null; isAdmin?: boolean };
  }) {
    if (data.scopeSpaceIds?.length === 0) return [];
    const typeVisibility = visibleDocumentWhere({
      roleId: data.actor?.roleId ?? null,
      isAdmin: !!data.actor?.isAdmin,
      userId: data.actor?.userId ?? null,
    });
    const rows = await this.prisma.document.findMany({
      where: {
        ...(typeVisibility ?? {}),
        organizationId: data.organizationId,
        ...(data.scopeSpaceIds
          ? {
              user: {
                spaceAssignments: {
                  some: {
                    spaceId: { in: data.scopeSpaceIds },
                    ...notEndedWhere(),
                  },
                },
              },
            }
          : {}),
        type: { isCredential: true, isActive: true },
        // PENDING_VERIFICATION is here on purpose: a renewal somebody has
        // already sent in is the single most useful thing to see beside a
        // certificate that is about to lapse. It is marked as not counting yet,
        // never shown as valid.
        status: { in: ['ISSUED', 'SIGNED', 'EXPIRED', 'PENDING_VERIFICATION'] },
      },
      select: {
        id: true,
        title: true,
        expiresOn: true,
        status: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        type: {
          select: { id: true, label: true, requiredForWorkflowIds: true },
        },
      },
      orderBy: [{ expiresOn: 'asc' }],
    });

    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      expiresOn: r.expiresOn,
      member: r.user,
      credential: r.type.label,
      /*
        Awaiting review is a STANDING of its own, not a flavour of valid.

        A licence sitting in the review queue with a 2030 date would otherwise
        read as VALID on this board while the dispatch gate — which reads status
        — still refuses the person. The board exists to answer "can this person
        work?", so that gap is the one thing it must not have.
      */
      awaitingVerification: r.status === 'PENDING_VERIFICATION',
      standing:
        r.status === 'PENDING_VERIFICATION' ? 'AWAITING' : credentialStanding(r.expiresOn, now),
      daysLeft: r.expiresOn ? daysUntil(r.expiresOn, now) : null,
      /*
        Whether this actually stops anybody working.

        A lapsed certificate that gates no task type is a reminder; one that
        gates a task type has removed somebody from the pool. Saying which is
        the difference between a list and something a dispatcher can act on.
      */
      blocksDispatch:
        r.type.requiredForWorkflowIds.length > 0 &&
        r.status !== 'PENDING_VERIFICATION' &&
        credentialStanding(r.expiresOn, now) === 'EXPIRED',
      gatesTaskTypes: r.type.requiredForWorkflowIds,
    }));
  }
}
