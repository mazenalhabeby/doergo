import { Injectable, NotFoundException } from '@nestjs/common';
import {
  notEndedWhere,
  success,
  paginated,
  stripWorkspaceTerms,
  currencyOrNull,
  workspaceCurrency,
  DEFAULT_CURRENCY,
  clampListLimit,
  clampListPage,
  orgCurrency,
} from '@hbcfield/shared';
import { readAutoClock } from './space-helpers';
import { PrismaService } from '@hbcfield/shared';
import type { Prisma, SpaceKind } from '@prisma/client';

/** Reading workspaces: the list, one workspace. */
@Injectable()
export class SpaceReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all company locations for an organization
   */
  async findAll(data: {
    organizationId: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    search?: string;
    kind?: string;
    /** Caller, for the Access Profile space scope below. */
    viewerId?: string;
    /**
     * Workspace visibility from the caller's Access Profile.
     *
     * Applied HERE, in the query, rather than by filtering the response.
     * The gateway used to page the org's whole directory out of the database
     * and then drop the rows the member could not see, which made `total` and
     * every page boundary describe a list nobody was shown: a member assigned
     * to one space on page 5 got four empty pages first, and the dashboard
     * worked around it by fetching every page. Scoping the WHERE clause makes
     * the count and the pages describe what the member actually gets, and stops
     * the unreadable rows leaving the database at all.
     */
    spaceScope?: 'own' | 'tasks' | 'all';
  }) {
    // Request numbers — bounded (1..200, NaN → default) so `?limit=1000000`
    // cannot page the whole directory out in one response.
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const skip = (page - 1) * limit;

    // 'tasks' means no workspace view at all — answer without touching the DB.
    if (data.spaceScope === 'tasks') {
      return paginated([], { page, limit, total: 0 });
    }
    // 'own' with no caller to scope against shows NOTHING, not everything. The
    // gateway always sends viewerId, so this is the defensive branch — but the
    // alternative default for a visibility control is to leak the whole
    // directory, which is the wrong way for it to fail.
    if (data.spaceScope === 'own' && !data.viewerId) {
      return paginated([], { page, limit, total: 0 });
    }

    const where: Prisma.CompanyLocationWhereInput = {
      organizationId: data.organizationId,
      // Never surface the org's internal "Remote" bucket (the geofence-exempt
      // WFH clock-in target). It's an attendance implementation detail, not a
      // real Space/work location — schema marks it "hidden from pickers".
      isRemote: false,
    };

    // Ownership-kind scope. Ownership (project / my company / customer company)
    // is a LABEL describing whose place a space is — it never changes how the
    // space behaves. In field service the customer's site IS where the crew
    // works, so a CUSTOMER space with a roster must appear everywhere a normal
    // space does (dashboard, task-assign, attendance, schedule). An earlier
    // default hid CUSTOMER from these lists on the assumption that such spaces
    // hold no members; that isn't true here, and hiding them made real crews
    // vanish from the dashboard. A specific `kind` still narrows the query
    // (e.g. a customer directory); 'all' is accepted and means the same as
    // omitting it. Served by @@index([organizationId, kind, name]).
    if (data.kind && data.kind !== 'all') {
      where.kind = data.kind as SpaceKind;
    }

    // By default, only show active locations
    if (!data.includeInactive) {
      where.isActive = true;
    }

    // 'own' → only spaces this member is currently assigned to. Same effective
    // window as the roster include below, so a space cannot appear in the list
    // via an assignment that has already lapsed.
    if (data.spaceScope === 'own' && data.viewerId) {
      where.spaceAssignments = {
        some: {
          userId: data.viewerId,
          ...notEndedWhere(),
        },
      };
    }

    // Optional name/address search (used by global search).
    const search = data.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [locations, total] = await Promise.all([
      this.prisma.companyLocation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          workflow: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
          // Active member assignments — lets clients render each location's
          // roster without an extra request per location (avoids N+1).
          spaceAssignments: {
            where: {
              ...notEndedWhere(),
            },
            select: { userId: true, isPrimary: true },
          },
        },
      }),
      this.prisma.companyLocation.count({ where }),
    ]);

    // Keep the legacy `assignments` key on each location for client compat
    // (storage moved to the unified space_assignments table in Phase 5b).
    // Strip customer contact PII from the LIST projection — it's least-privilege
    // sensitive and the list never needs it (the config/detail view uses the
    // canViewAllTasks-gated findOne, which keeps the contact fields) (M3).
    const shaped = locations.map(({ spaceAssignments, contactName, contactEmail, contactPhone, ...l }) => ({
      ...l,
      assignments: spaceAssignments,
    }));

    return paginated(shaped, { page, limit, total });
  }

  /**
   * Get a single company location by ID.
   *
   * Two inputs from the gateway narrow it to what THIS caller may read:
   *
   * - `viewScopeSpaceIds` — the workspaces the caller may see (`spacesGranting`
   *   of their view permission). `undefined`/`null` = org-wide (admin, an
   *   org-wide grant, or a legacy caller); `[ids]` = only those; `[]` = none.
   *   A workspace outside it is 404 — the same answer as one that does not
   *   exist, so the id confirms nothing. A space SHARED with the caller's org
   *   is reached through the share, not this scope.
   * - `mayManage` — may the caller manage THIS workspace (`canManageSpace` /
   *   `mayManageSpaceMembers` for the route's id)? When false, the client's
   *   contact person and the workspace's rates are removed
   *   (`stripWorkspaceTerms`, the roster rule's sibling). `undefined` keeps the
   *   old full answer for an own-organization workspace (callers that predate
   *   the field) and strips for a space shared IN from another organization,
   *   whose client terms are the owner's business.
   */
  async findOne(data: {
    id: string;
    organizationId: string;
    sharedSpaceIds?: string[];
    viewScopeSpaceIds?: string[] | null;
    mayManage?: boolean;
  }) {
    // A guest org may open a space shared with it: if the id is in the caller's
    // server-authoritative received-shares set, scope by id alone (the space is
    // foreign); otherwise keep the strict org filter.
    const isShared = Array.isArray(data.sharedSpaceIds) && data.sharedSpaceIds.includes(data.id);
    if (!isShared && Array.isArray(data.viewScopeSpaceIds) && !data.viewScopeSpaceIds.includes(data.id)) {
      throw new NotFoundException('Company location not found');
    }
    const location = await this.prisma.companyLocation.findFirst({
      where: isShared ? { id: data.id } : { id: data.id, organizationId: data.organizationId },
      include: {
        workflow: {
          include: {
            statuses: { orderBy: { position: 'asc' } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    // How many client-facing rates this workspace has set — what a currency
    // switch would re-read. Bill rates only: costs are in the organization's.
    const ratesSet = await this.prisma.rateHistory.count({
      where: {
        organizationId: location.organizationId,
        kind: { in: ['BILL_HOUR', 'BILL_DAY'] },
        cents: { not: null },
        OR: [{ target: 'SPACE', targetId: location.id }, { spaceId: location.id }],
      },
    });

    // What its rates are in: its own currency, else the organization's — said
    // here so a workspace page never has to ask for the organization profile.
    const org = await orgCurrency(this.prisma, location.organizationId);
    const organizationCurrency = currencyOrNull(org?.currency) ?? DEFAULT_CURRENCY;

    const mayManage = data.mayManage ?? !isShared;
    return success(
      stripWorkspaceTerms(
        {
          ...location,
          // Parsed: the stored object with the defaults filled in, or null (never configured = off).
          autoClock: readAutoClock(location.autoClock),
          ratesSet,
          organizationCurrency,
          effectiveCurrency: workspaceCurrency(location, { currency: organizationCurrency }),
        },
        mayManage,
      ),
    );
  }
}
