import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  getSpaceScope,
  isAdmin,
  ownAccess,
  accessAllows,
  mayViewSpaceRoster,
  mayManageSpaceMembers,
  stripSpaceTerms,
} from '@hbcfield/shared';
import { outrankCeiling } from '../space-roles/space-member-access';
import { AssignMemberDto, UpdateAssignmentDto } from './dto';
import { AUTO_CLOCK_MEMBER_FIELDS } from './locations-controller-helpers';
import { LocationsControllerBase } from './locations-controller.base';

/**
 * /locations/:id/members — a workspace's people: the roster, assigning, changing
 * an assignment, removing.
 */
@ApiTags('locations')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('locations')
export class LocationMembersController extends LocationsControllerBase {

  // ==================== MEMBER ASSIGNMENT ENDPOINTS ====================

  @Get(':id/members')
  /*
    Read-only roster of a space, with each person's email and what they are
    working on right now. ⚠️ It used to have NO gate — "any member of the org may
    view it" — so anybody, an external member included, read any workspace's
    people by id, and each person's negotiated bill rate there with them.

    Now the rule GET /locations/rosters already followed: a viewing grant for
    THIS space (admin, follow / assign its work, supervise its attendance,
    manage its people) reads it whole; otherwise an internal member reads the
    spaces their Access Profile allows (assigned → their own). An external
    member has no "own" path — only the grant in the space they supervise, which
    is what the External Supervisor's attendance screens read. Outside that the
    space reads as not found.

    A member's bill rate here leaves only for whoever manages this space's
    people; cost rates already stop at the LabourCostInterceptor on this class.
  */
  @ApiOperation({ summary: 'Get members assigned to a location' })
  async getLocationMembers(@Param('id') id: string, @Request() req: any) {
    const res: any = await this.locationsService.getLocationAssignments({
      locationId: id,
      organizationId: req.user.organizationId,
      // Cross-org shared spaces whose owner enabled "show workers" — the only
      // foreign rosters this caller may read (server-authoritative).
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? [])
        .filter((s: any) => s.showWorkers)
        .map((s: any) => s.spaceId),
      requesterId: req.user.id,
      spaceScope: req.user.isExternal === true ? 'tasks' : getSpaceScope(req.user),
      canViewAll: mayViewSpaceRoster(req.user, id),
    });
    if (res && Array.isArray(res.data)) {
      const mayManage = mayManageSpaceMembers(req.user, id);
      // Whether a colleague consented to the automatic clock is the office's business, not every reader's.
      const rows = mayManage
        ? res.data
        : res.data.map((r: any) => (r?.user ? { ...r, user: { ...r.user, autoClockConsentAt: undefined } } : r));
      return { ...res, data: stripSpaceTerms(rows, mayManage) };
    }
    return res;
  }

  // Space-aware: org member-managers add anyone in their org; a CONTROL guest may
  // add their OWN people to a space shared with them (service enforces the real
  // space + tags the row with the guest org). Guard widens; the controller decides
  // against the space in the PATH (`assertMayManageMembersIn`); the service
  // confines a caller to people of their own organization.
  //
  // `canAddSpaceMembers` OR the workspace grant, decided in the controller (a
  // route decorator can only AND its keys, and the guard never reads `:id`):
  // a space role cannot carry `canManageWorkspaces`, so an outsider running one
  // site could never add their own crew. This route sets no role, so adding
  // somebody grants nothing by itself.
  @Post(':id/members')
  @ApiOperation({ summary: 'Assign a member to a location' })
  async assignMember(
    @Param('id') locationId: string,
    @Body() dto: AssignMemberDto,
    @Request() req: any,
  ) {
    this.assertMayManageMembersIn(req, locationId);
    const result = await this.locationsQueueService.assignMember({
      ...dto,
      locationId,
      requestingUserId: req.user.id,
      organizationId: req.user.organizationId,
      // server-authoritative; service enforces the real space. OWN access: it is also a grant ceiling.
      access: ownAccess(req.user.access),
    });
    /*
      A space assignment carries a ROLE, and an external member's seat price is
      read from the permissions that role grants — an Observer is €2, a
      Supervisor €9.99. So assigning somebody, or moving them between roles,
      moves the bill.

      Without this the change was only picked up by the nightly sweep: up to a
      day billed at the wrong rate, and — worse to use — a price that does not
      move when you change the thing that sets it.
    */
    this.rebill(req.user.organizationId);
    return result;
  }

  @Patch(':id/members/:assignmentId')
  /*
    No route-level permission: decided below against the space in the PATH.

    ⚠️ It was `@RequirePermission('canManageWorkspaces')`, which the guard reads
    as "granted in ANY space" — so somebody who manages one site could edit an
    assignment at every other. Now:
      • org-wide `canManageWorkspaces` (or admin): any field, any assignment;
      • `canManageWorkspaces` in THIS workspace: any field, narrowed to it;
      • managing this workspace's people (`mayManageSpaceMembers`, the space
        manager — the same rule as a member's roles and rate here): the
        automatic-clock choice only, narrowed to it.
    "Narrowed" = the service refuses an assignment of another workspace as not found.
  */
  @ApiOperation({ summary: 'Update a member assignment' })
  async updateAssignment(
    @Param('id') locationId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req: any,
  ) {
    const u = req.user;
    const orgWide = isAdmin(u) || accessAllows(u?.access, 'canManageWorkspaces');
    if (!orgWide) {
      const workspaceManager = accessAllows(u?.access, 'canManageWorkspaces', locationId);
      const onlyAutoClock = Object.entries(dto ?? {}).every(([k, v]) => AUTO_CLOCK_MEMBER_FIELDS.has(k) || v === undefined);
      if (!workspaceManager && !(onlyAutoClock && mayManageSpaceMembers(u, locationId))) {
        throw new ForbiddenException('You do not have permission to manage the members of this workspace');
      }
    }
    const result = await this.locationsQueueService.updateAssignment({
      ...dto,
      assignmentId,
      organizationId: req.user.organizationId,
      spaceId: orgWide ? undefined : locationId,
    });
    // Same reason as assignMember: this route can change the assignment's role.
    this.rebill(req.user.organizationId);
    return result;
  }

  /*
    ⚠️ It was `@RequirePermission('canManageWorkspaces')` and never read the
    space in the path, so the assignment could be in any workspace. Now the
    same rule as adding: `canAddSpaceMembers` (or the workspace grant) HERE, the
    row must be in this workspace unless the caller manages workspaces
    org-wide, and somebody acting only through this workspace may not remove a
    person who holds more in it than they do.
  */
  @Delete(':id/members/:assignmentId')
  @ApiOperation({ summary: 'Remove a member assignment' })
  async removeAssignment(
    @Param('id') locationId: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: any,
  ) {
    this.assertMayManageMembersIn(req, locationId);
    const orgWide = isAdmin(req.user) || accessAllows(req.user?.access, 'canManageWorkspaces');
    const result = await this.locationsQueueService.removeAssignment({
      assignmentId,
      organizationId: req.user.organizationId,
      spaceId: orgWide ? undefined : locationId,
      outrankPerms: outrankCeiling(req.user, locationId),
    });
    // Losing a space role can move an external member back to the full seat.
    this.rebill(req.user.organizationId);
    return result;
  }
}
