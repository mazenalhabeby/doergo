import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DayRangeQueryDto } from './dto/day-range.dto';
import { Role, assertServiceOk } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { StartBreakDto, EndBreakDto, AddBreakForMemberDto, BreakRuleDto, SnoozeBreakDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AllowWhenLocked } from '../../common/guards/subscription.guard';
import { BreaksGatewayService } from './breaks.gateway-service';
import { scopeFor } from '../../common/permission-scope';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { DecisionNotesDto } from './dto/decision-bodies.dto';
/** /attendance — rests: taking one, the rules, a member's breaks. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class BreaksController {
  constructor(private readonly breaksGateway: BreaksGatewayService) {}

  // =========================================================================
  // BREAKS
  // =========================================================================

  @Post('breaks/start')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Start a break during current shift' })
  async startBreak(@Body() dto: StartBreakDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.startBreak({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      type: dto.type,
      notes: dto.notes,
      // Which planned rest this answers. Never trusted for anything but
      // matching: the plan is on the server and an id that is not in it simply
      // does not match, leaving an ordinary unplanned break.
      ruleId: dto.ruleId,
      id: dto.id,
      entryId: dto.entryId,
      evidence: dto.evidence,
    });
  }

  /**
   * "Later" — postpone the rest the member was just asked about.
   *
   * The snooze COUNT lives on the server. If the phone kept it, "Later" would be
   * a mute button and a device that is off would silence the alarm by not
   * existing.
   */
  @Post('breaks/snooze')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Postpone the rest that has fallen due' })
  async snoozeBreak(@Body() dto: SnoozeBreakDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.snoozeBreak({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      ruleId: dto.ruleId,
    });
  }

  // ── Rest rules: what a workspace expects ─────────────────────────────────
  //
  // Reading is open to anyone who can clock in — a member is entitled to know
  // when their own rests fall due. Writing is workspace configuration and takes
  // the same permission as the rest of it.

  @Get('break-rules')
  @RequireModule('time_tracking')
  @ApiOperation({ summary: 'The planned rests for a workspace or shift' })
  async listBreakRules(
    @Request() req: AuthedRequest,
    @Query('spaceId') spaceId?: string,
    @Query('shiftId') shiftId?: string,
  ) {
    return this.breaksGateway.listBreakRules({
      organizationId: callerOrgId(req.user),
      spaceId,
      shiftId,
    });
  }

  @Post('break-rules')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Add a planned rest' })
  async createBreakRule(@Body() dto: BreakRuleDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.createBreakRule({
      ...dto,
      // Never from the body: the organization is whose token this is.
      organizationId: callerOrgId(req.user),
      // The guard passes a grant in ANY workspace; the service narrows it to
      // the rule's own workspace (`BreakRulesService.assertMayManage`).
      scopeSpaceIds: scopeFor(req.user, 'canManageWorkspaces'),
    });
  }

  @Patch('break-rules/:id')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Change a planned rest' })
  async updateBreakRule(@Param('id') id: string, @Body() dto: BreakRuleDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.updateBreakRule({
      ...dto,
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canManageWorkspaces'),
    });
  }

  @Delete('break-rules/:id')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Remove a planned rest' })
  async deleteBreakRule(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.breaksGateway.deleteBreakRule({
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canManageWorkspaces'),
    });
  }

  @Post('breaks/end')
  // Ends the caller's own running work — never stranded by a lapsed subscription.
  @AllowWhenLocked()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'End current break' })
  async endBreak(@Body() dto: EndBreakDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.endBreak({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      notes: dto.notes,
      breakId: dto.breakId,
      evidence: dto.evidence,
    });
  }

  @Get('breaks/status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current break status' })
  async getBreakStatus(@Request() req: AuthedRequest) {
    return this.breaksGateway.getBreakStatus({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get('entries/:id/breaks')
  @ApiOperation({ summary: 'Get breaks for a specific time entry' })
  async getBreaksForEntry(@Param('id') timeEntryId: string, @Request() req: AuthedRequest) {
    // No permission gate on the route: a member reads the rests of their own
    // shift. Anybody else's entry is narrowed in the service to the spaces
    // where the caller holds canViewSpaceAttendance — the entry-read rule.
    return this.breaksGateway.getBreaksForEntry({
      timeEntryId,
      organizationId: callerOrgId(req.user),
      requesterId: req.user.id,
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
    });
  }

  @Get('breaks/active')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all active breaks in the organization' })
  async getActiveBreaks(@Request() req: AuthedRequest) {
    return this.breaksGateway.getActiveBreaks({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
    });
  }

  @Get('breaks/history')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get break history with filters' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, enum: ['LUNCH', 'SHORT', 'OTHER'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getBreakHistory(
    @Query('date') date: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('type') type: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.breaksGateway.getBreakHistory({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      date,
      userId,
      type,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Add a break to a member's shift on their behalf.
   *
   * Breaks stay self-service — this is the correction path for when that did not
   * happen: a dead phone, a shift reconstructed after the fact.
   *
   * On `canReconcileAttendance`, the grant that already covers correcting
   * somebody else's attendance, rather than on being an ADMIN. The person who
   * does payroll should be able to hold it without also being handed the
   * organization, and an admin who should not touch timesheets should be able to
   * not hold it.
   */
  @Post('entries/:id/breaks')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'Add a break to a member’s shift (reconciliation)' })
  async addBreakForMember(
    @Param('id') timeEntryId: string,
    @Body() dto: AddBreakForMemberDto,
    @Request() req: AuthedRequest,
  ) {
    const result = await this.breaksGateway.addBreakForMember({
      timeEntryId,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canReconcileAttendance'),
      editorId: req.user.id,
      type: dto.type,
      startedAt: dto.startedAt,
      endedAt: dto.endedAt,
      reason: dto.reason,
    });
    return assertServiceOk(result);
  }

  /**
   * Remove a break from a shift.
   *
   * Same grant as adding one — correcting somebody else's attendance is one
   * capability, not several. Deleting recomputes the shift's break total and
   * returns an approved entry to PENDING, because its paid hours change.
   */
  @Delete('breaks/:id')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'Remove a break from a shift (reconciliation)' })
  async deleteBreak(@Param('id') breakId: string, @Request() req: AuthedRequest) {
    const result = await this.breaksGateway.deleteBreak({
      breakId,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canReconcileAttendance'),
      editorId: req.user.id,
    });
    return assertServiceOk(result);
  }

  @Post('breaks/:id/end')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'End a break manually (manager action)' })
  async endBreakManually(@Param('id') breakId: string, @Body() body: DecisionNotesDto, @Request() req: AuthedRequest) {
    return this.breaksGateway.endBreakManually({
      breakId,
      adminId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canReconcileAttendance'),
      notes: body?.notes,
    });
  }

  @Get('breaks/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get break summary statistics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  async getBreakSummary(@Query() q: DayRangeQueryDto, @Request() req: AuthedRequest) {
    const { startDate, endDate, userId } = q;
    return this.breaksGateway.getBreakSummary({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canViewSpaceAttendance'),
      startDate,
      endDate,
      userId,
    });
  }
}
