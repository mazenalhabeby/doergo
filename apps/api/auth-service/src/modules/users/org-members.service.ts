import { personSearchOr, clampListLimit } from '@hbcfield/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { ListOrgMembersDto } from './dto';
import { DIRECTORY_MEMBER_SELECT, MANAGER_CANDIDATE_SELECT, ORG_MEMBER_SELECT } from './users-common';

/**
 * The organization's members as the Members page reads them: the list with its
 * filters, and one member.
 */
@Injectable()
export class OrgMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all members of an organization with filtering and pagination
   */
  async listOrgMembers(
    dto: ListOrgMembersDto & { managersOnly?: boolean; includeIds?: string[]; excludeId?: string; lite?: boolean },
  ) {
    const { organizationId, search, role } = dto;
    // Clamp pagination server-side so a client can't request an unbounded page (M6).
    const page = Math.max(1, Number(dto.page) || 1);
    const limit = clampListLimit(dto.limit, 10, 200);

    // Members = staff only. Portal customers (they carry a customerId) live in
    // Clients Portals, not here — excluding them keeps admins from accidentally
    // re-roling a customer into a staff account (which breaks their portal login).
    const where: Prisma.UserWhereInput = { organizationId, customerId: null };

    /*
      One filter, two kinds of thing.

      The screen's Role column shows a member's ASSIGNED ROLE where they have one
      ("Manager", "Sales") and falls back to the account type otherwise. The
      filter beside it only ever offered the account types, so a role an
      organization created could be visible in every row and selectable in none.

      An access-role id is a cuid; the account types are a closed set of
      upper-case words. Matching the words first means a role can never be
      mistaken for a type, whatever it is called — and anything else is treated
      as a role id, which simply matches nobody if it is nonsense.
    */
    if (role) {
      if (role === 'ADMIN' || role === 'EMPLOYEE' || role === 'CUSTOMER') {
        where.role = role;
      } else if (role === 'none') {
        // "No role" is a real thing to look for: these members hold no org-wide
        // permissions at all, which the Employee badge hides rather than shows.
        where.memberRoleId = null;
      } else {
        where.memberRoleId = role;
      }
    }

    /*
      Admins and managers only — the leadership set.

      Shared by every picker that offers "an admin or a manager": the contact
      allow-list and the notification watchers both need exactly this, and each
      had grown its own client-side approximation of it. The watchers list
      matched `!!memberRole`, which in the unified role system is every member
      who has any role at all — technicians included.

      The picker used to ask for 200 members and filter them in the browser, so
      an organization's whole staff list — Access Profiles, contact allow-lists,
      role joins — was read, serialised and thrown away to render a handful of
      rows. Same defect the spaces list had: the filter belongs in the query.

      `includeIds` keeps anyone already on the member's allow-list in the
      result even if they no longer qualify. Leaving them out would not remove
      the grant, only hide it.
    */
    if (dto.excludeId) {
      where.id = { not: dto.excludeId };
    }

    if (dto.managersOnly) {
      where.isActive = true;
      /*
        Candidates are defined by ROLE: the ADMIN system role, or an assigned
        role whose permission set grants canManageUsers.

        Deliberately NOT the canManageUsers column on the user row. That column
        is legacy — buildResolvedAccess still merges it, so it does still grant
        the capability, but it is drift rather than a position anyone was given.
        Including it listed people the organization does not consider managers
        (a technician carrying a stale flag) as if they were, which is the whole
        confusion this picker should not add to. Clean that drift up on the
        member's Access tab, where it is shown as a direct grant.
      */
      const or: Prisma.UserWhereInput[] = [
        { role: 'ADMIN' },
        { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
      ];
      const keep = (dto.includeIds ?? []).filter(Boolean);
      if (keep.length) or.push({ id: { in: keep } });
      // Combined with a search's own OR via AND so neither clause swallows the other.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: or }];
        delete where.OR;
      } else {
        where.OR = or;
      }
    }

    const nameMatch = personSearchOr(search);
    if (nameMatch) where.OR = nameMatch;

    const total = await this.prisma.user.count({ where });

    const members = await this.prisma.user.findMany({
      where,
      // The picker renders a name, an avatar and a label — it has no use for
      // Access Profiles or allow-lists, and those are the expensive columns.
      select: dto.managersOnly ? MANAGER_CANDIDATE_SELECT : dto.lite ? DIRECTORY_MEMBER_SELECT : ORG_MEMBER_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    /*
      Who owns this organization, once per page rather than once per row.

      One primary-key lookup on a column that is unique, against a row already in
      cache on any warm instance. Flagging the rows here means the screen can
      label the owner and grey out the actions that would be refused, instead of
      offering them and reporting the refusal afterwards.
    */
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });

    return {
      success: true,
      data: members.map((m) => ({ ...m, isOwner: !!org?.ownerId && m.id === org.ownerId })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fetch a SINGLE org member by id, in the same shape as a list row. Org-scoped;
   * excludes portal customers. Lets the member detail page fetch one row instead
   * of pulling the whole org and finding it client-side (P1).
   */
  async getOrgMemberById(memberId: string, organizationId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId, customerId: null },
      select: ORG_MEMBER_SELECT,
    });
    if (!member) throw new NotFoundException('Member not found');
    return { success: true, data: member };
  }
}
