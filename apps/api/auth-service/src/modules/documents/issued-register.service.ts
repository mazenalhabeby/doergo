import { ForbiddenException, Injectable } from '@nestjs/common';
import { personName, chainProgress, type SignerStep, clampListLimit } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@hbcfield/shared';
import { type DocumentActor, typeScope } from './document-common';
import { REGISTER_ROW_SELECT } from './document-registers-helpers';

/** The issued register: what the office sent, with its counts — read inside the reader's type scope. */
@Injectable()
export class IssuedRegisterService {
  constructor(private readonly prisma: PrismaService) {}

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
    const limit = clampListLimit(data.limit, 25, 100);

    // The organization scope is on every branch below, never added later: it is
    // what stops a guessed type or user id reaching across tenants.
    const base: Prisma.DocumentWhereInput = {
      // On the base, so it reaches the rows, the total AND the tab counts. A
      // filter applied only to the rows leaves the tabs counting documents the
      // reader cannot open — which is how a restriction announces the existence
      // of what it is hiding.
      ...typeScope(data.actor),
      organizationId: data.actor.organizationId,
      status: { not: 'DRAFT' },
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.userId ? { userId: data.userId } : {}),
      ...(data.year ? { periodYear: data.year } : {}),
      ...(data.search ? { title: { contains: data.search.trim(), mode: 'insensitive' as const } } : {}),
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
          ...REGISTER_ROW_SELECT,
          type: { select: { id: true, label: true, signatureMode: true, isCredential: true } },
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

    const counted = (s: string) => byStatus.find((g) => g.status === s)?._count ?? 0;

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
        memberName: personName(d.user),
        typeId: d.type.id,
        typeLabel: d.type.label,
        signatureMode: d.type.signatureMode,
        isCredential: d.type.isCredential,
        hiddenFromMember: d.hiddenFromMember,
        rolesOverridden: d.rolesOverridden,
        visibleToRoleIds: d.visibleToRoleIds,
        signatureCount: d._count.signatures,
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
                waitingOn: row ? (row.user ? personName(row.user) : (row.customer?.name ?? null)) : null,
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
}
