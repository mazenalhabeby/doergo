import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { type AccessPermissionKey } from '@hbcfield/shared';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { ShiftsService } from './shifts.service';
import { scopeFor } from '../../common/permission-scope';

/**
 * Shift definitions + the rota (member → shift). All mutations require
 * canManageUsers; organizationId is always taken from the caller's token.
 * Tier-gated: shift scheduling is a Professional+ capability (write routes 402
 * under-tier; reads pass so a downgraded org still sees its config).
 */
@ApiTags('shifts')
@ApiBearerAuth()
@RequirePlan('shift_scheduling')
@Controller()
export class ShiftsController {
  /**
   * Which spaces this caller may act in — see the attendance controller for the
   * full reasoning. Routes naming `:spaceId` are enforced by the guard itself;
   * the id-keyed ones are narrowed in the service, through getOwnedShift and
   * assertSpaceInOrg.
   */
  private scope(req: any, key: AccessPermissionKey): string[] | null {
    return scopeFor(req.user, key);
  }

  constructor(private readonly service: ShiftsService) {}

  // ── Shifts ──
  @Get('shifts')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'List shift definitions (optionally scoped to a space)' })
  listShifts(@Query('spaceId') spaceId: string | undefined, @Request() req: any) {
    return this.service.listShifts({ organizationId: req.user.organizationId, scopeSpaceIds: this.scope(req, 'canManageRota'), spaceId });
  }

  @Post('shifts')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Create a shift definition' })
  createShift(@Body() body: any, @Request() req: any) {
    return this.service.createShift({ ...body, organizationId: req.user.organizationId, scopeSpaceIds: this.scope(req, 'canManageRota') });
  }

  @Patch('shifts/:id')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Update a shift definition' })
  updateShift(@Param('id') shiftId: string, @Body() body: any, @Request() req: any) {
    return this.service.updateShift({ ...body, shiftId, organizationId: req.user.organizationId, scopeSpaceIds: this.scope(req, 'canManageRota') });
  }

  @Delete('shifts/:id')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Delete a shift definition' })
  deleteShift(@Param('id') shiftId: string, @Request() req: any) {
    return this.service.deleteShift({ shiftId, organizationId: req.user.organizationId, scopeSpaceIds: this.scope(req, 'canManageRota') });
  }

  // ── Rota (assignments) ──
  /**
   * ONE workspace's week, as the clock-in reads it — the Schedules page.
   *
   * ⚠️ READ ON `canViewSpaceAttendance`, the leader permission staffing is
   * gated on elsewhere (cover, the live floor): who works when is a staffing
   * fact, not "the work", and `canViewAllTasks` is held by the €2 observer.
   * The service narrows to the spaces granting it; `canEdit` is answered from
   * `canManageRota`, and the write below checks it again.
   */
  @Get('rota/week')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'A workspace week: each member, each day, as the clock-in resolves it' })
  weekRota(@Query('spaceId') spaceId: string | undefined, @Query('from') from: string | undefined, @Request() req: any) {
    return this.service.weekRota({
      organizationId: req.user.organizationId,
      viewScope: this.scope(req, 'canViewSpaceAttendance'),
      editScope: this.scope(req, 'canManageRota'),
      spaceId,
      from,
    });
  }

  /** Change one person's day: a shift or off, that day only or that weekday from then on. */
  @Post('rota/day')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Set one member\'s shift for one day, once or weekly' })
  setRotaDay(@Body() body: { spaceId: string; userId: string; date: string; shiftId?: string | null; repeat: 'once' | 'weekly' }, @Request() req: any) {
    return this.service.setRotaDay({
      organizationId: req.user.organizationId,
      editScope: this.scope(req, 'canManageRota'),
      spaceId: String(body?.spaceId ?? ''),
      userId: String(body?.userId ?? ''),
      date: String(body?.date ?? ''),
      shiftId: body?.shiftId ? String(body.shiftId) : null,
      repeat: body?.repeat === 'weekly' ? 'weekly' : 'once',
      createdById: req.user.id,
    });
  }

  @Get('spaces/:spaceId/rota')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'List the rota for a space' })
  listAssignments(
    @Param('spaceId') spaceId: string,
    @Query('includeEnded') includeEnded: string | undefined,
    @Request() req: any,
  ) {
    return this.service.listAssignments({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canManageRota'),
      spaceId,
      includeEnded: includeEnded === 'true',
    });
  }

  @Post('spaces/:spaceId/rota')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Assign a member to a shift in a space' })
  createAssignment(@Param('spaceId') spaceId: string, @Body() body: any, @Request() req: any) {
    return this.service.createAssignment({
      ...body,
      spaceId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canManageRota'),
      createdById: req.user.id,
    });
  }

  @Patch('rota/:id')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Update a rota assignment' })
  updateAssignment(@Param('id') assignmentId: string, @Body() body: any, @Request() req: any) {
    return this.service.updateAssignment({ ...body, assignmentId, organizationId: req.user.organizationId, actorId: req.user.id, scopeSpaceIds: this.scope(req, 'canManageRota') });
  }

  @Delete('rota/:id')
  @RequirePermissionInSpace('canManageRota')
  @ApiOperation({ summary: 'Remove a rota assignment' })
  deleteAssignment(@Param('id') assignmentId: string, @Request() req: any) {
    return this.service.deleteAssignment({ assignmentId, organizationId: req.user.organizationId, scopeSpaceIds: this.scope(req, 'canManageRota') });
  }
}
