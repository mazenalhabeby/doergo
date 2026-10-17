import { ForbiddenException, Injectable } from '@nestjs/common';
import { personName } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type DocumentActor, typeScope } from './document-common';
import { DocumentLookupService } from './document-lookup.service';
import { DocumentChainService } from './document-chain.service';
import { REGISTER_ROW_SELECT } from './document-registers-helpers';

@Injectable()
export class DocumentRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: DocumentLookupService,
    private readonly chain: DocumentChainService,
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
          memberName: personName(d.user),
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
      labels = new Map(users.map((u) => [u.id, personName(u)]));
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
}
