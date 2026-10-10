import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  credentialStanding,
  isCurrentSigner,
  chainProgress,
  type SignerStep,
} from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type DocumentActor,
  assertTypeVisible,
  typeScope,
  maySeeDrafts,
  assertNotHiddenDraft,
} from './document-common';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentRoutingService } from './document-routing.service';

/**
 * The registers: the folder tree, the issued register, one member's file, and a
 * document's evidence trail.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
/** What a register row shows of a document — `type` is chosen per register. */
const REGISTER_ROW_SELECT = {
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
  hiddenFromMember: true,
  rolesOverridden: true,
  visibleToRoleIds: true,
  _count: { select: { signatures: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  signatures: {
    select: { signedAt: true },
    orderBy: { signedAt: 'desc' as const },
    take: 1,
  },
} as const;

/** The fields every row of a member's document list carries, theirs or waiting on them. */
function listRow(d: {
  id: string; title: string; typeId: string; type: { key: string; label: string };
  periodYear: number | null; periodMonth: number | null; status: string;
  sizeBytes: number | null; mimeType: string | null; issuedAt: Date | null;
  expiresOn: Date | null; firstOpenedAt: Date | null;
}) {
  return {
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
  };
}

@Injectable()
export class DocumentRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: DocumentLookupService,
    private readonly routing: DocumentRoutingService,
  ) {}

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
   * Every document in the organization, as one register.
   *
   * Issued AND supplied: a member's uploaded licence is in here beside the
   * payslips, because "what do we hold about this person" is one question. The
   * screen was called "Sent documents" until that was noticed — nothing here
   * was posted anywhere, and the folder view is a filing cabinet.
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
    // The register shows other people's documents by definition.
    const where: Prisma.DocumentWhereInput = {
      ...typeScope(data.actor),
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
        select: { ...REGISTER_ROW_SELECT, type: { select: { id: true, label: true } } },
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
          hiddenFromMember: d.hiddenFromMember,
          rolesOverridden: d.rolesOverridden,
          visibleToRoleIds: d.visibleToRoleIds,
          signatureCount: d._count.signatures,
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
      await this.lookup.assertMemberOfOrg(targetUserId, data.actor.organizationId);
    }

    /*
      Somebody else's file is scoped by document type; your own never is.

      `isSelf` is the distinction the permission check above already draws, so
      the visibility rule hangs off the same fact rather than inventing a second
      idea of whose file this is.
    */
    const where: Prisma.DocumentWhereInput = {
      // Somebody else's file by type and override; your own minus anything
      // hidden from you. The same fragment answers both.
      ...typeScope(data.actor),
      // Both, always. The organization scope is what stops a stale or guessed
      // user id reaching across tenants even when the id is otherwise valid.
      organizationId: data.actor.organizationId,
      userId: targetUserId,
      ...(data.typeId ? { typeId: data.typeId } : {}),
      ...(data.year ? { periodYear: data.year } : {}),
      // Drafts only for who stages them — never the subject (see assertNotHiddenDraft).
      ...(data.includeArchived && maySeeDrafts(data.actor) ? {} : { status: { not: 'DRAFT' as const } }),
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
        issuedById: true,
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
        ? await this.routing.documentsWaitingOnMe(data.actor)
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
        ...listRow(d),
        needsSignature: true,
        rejectionReason: null,
        standing: null as string | null,
        // Whose document it is. Without this a manager sees nine rows called
        // "Time sheet September" and cannot tell them apart.
        forMember: `${d.user.firstName} ${d.user.lastName}`.trim(),
      })),
      ...documents.map((d) => ({
      ...listRow(d),
      /*
        "Needs your signature" has to mean YOURS.

        A document with a route stays AWAITING_SIGNATURE until the whole chain
        is done, so reading the document's status told a member who had already
        signed that they still had to — with no way to make it go away. The
        chain knows better: where there are steps, this is true only while the
        pending one is theirs.
      */
      needsSignature: waitingOnViewer(d),
      // Their OWN upload (nobody issued it) — on an "either" type, the copy they may replace.
      suppliedByMember: d.issuedById === null,
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

  /** The evidence trail for one document. */
  async listEvents(data: { actor: DocumentActor; documentId: string }) {
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, organizationId: data.actor.organizationId },
      select: { id: true, userId: true, status: true, hiddenFromMember: true, rolesOverridden: true, visibleToRoleIds: true, type: { select: { visibleToRoleIds: true } } },
    });
    if (!document) throw new NotFoundException('Document not found');
    assertNotHiddenDraft(data.actor, document);

    assertTypeVisible(data.actor, document);
    const isSelf = document.userId === data.actor.userId;
    if (!isSelf && !data.actor.canViewMemberDocuments) {
      throw new NotFoundException('Document not found');
    }

    const events = await this.prisma.documentEvent.findMany({
      where: { documentId: document.id },
      orderBy: { at: 'asc' },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    /*
      Where somebody ELSE was, and on what device, is evidence for the
      organization — not something the subject or a list-only reader is owed.
      Your own lines stay whole; other people's lose ip, device and position
      unless you may open members' documents (or are an administrator).
    */
    if (data.actor.isAdmin || data.actor.canOpenMemberDocuments) return events;
    return events.map((e) =>
      e.actorId === data.actor.userId
        ? e
        : { ...e, ip: null, userAgent: null, lat: null, lng: null },
    );
  }
}
