import { Controller, Get, Post, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { RequestExtraTimeDto, ApproveExtraTimeDto, RejectExtraTimeDto, AddOvertimeDto } from './dto';
import { AllowWhenLocked } from '../../common/guards/subscription.guard';
import { AttendanceControllerBase } from './attendance-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** /attendance — forgot to clock out, extra time and overtime on a shift. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class ExtraTimeController extends AttendanceControllerBase {
  // ── Shift reminder responses ──────────────────────────────────────────────

  @Post('entries/:id/forgot-clock-out')
  // Ends the caller's own running work — never stranded by a lapsed subscription.
  @AllowWhenLocked()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Resolve a forgotten clock-out with a self-reported leave time' })
  async resolveForgotClockOut(
    @Param('id') entryId: string,
    @Body() body: { clockOutAt: string },
    @Request() req: AuthedRequest,
  ) {
    return this.extraTimeGateway.resolveForgotClockOut({
      entryId,
      clockOutAt: body.clockOutAt,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post('entries/:id/request-extra-time')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Request to keep working past the shift end (routes to a leader)' })
  async requestExtraTime(
    @Param('id') entryId: string,
    @Body() body: RequestExtraTimeDto,
    @Request() req: AuthedRequest,
  ) {
    return this.extraTimeGateway.requestExtraTime({
      entryId,
      // The moment it was asked — a phone without signal sends it later.
      occurredAt: body?.occurredAt ?? null,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get('extra-time/pending')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'List open extra-time requests the caller can approve' })
  async getPendingExtraTime(@Request() req: AuthedRequest) {
    return this.extraTimeGateway.listPendingExtraTime({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      // Org admins/managers see all; the space-role check runs server-side.
      isAdmin: req.user.role === Role.ADMIN || !!req.user.canManageUsers,
    });
  }

  // Leader actions: gated to authenticated staff; the real space-role permission
  // (canApproveOvertime) is enforced server-side in task-service.
  @Post('extra-time/:id/approve')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Approve N more minutes of overtime for an open shift' })
  async approveExtraTime(
    @Param('id') entryId: string,
    @Body() body: ApproveExtraTimeDto,
    @Request() req: AuthedRequest,
  ) {
    return this.extraTimeGateway.approveExtraTime({
      entryId,
      minutes: body.minutes,
      // The signature is stored exactly as drawn and bound to the round. It is
      // EVIDENCE, never authority: the right to approve comes from the token
      // this call was made with, checked again in task-service.
      signature: body.signature ?? null,
      notes: body.notes ?? null,
      approverId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  /*
    Overtime on a CLOSED shift nobody asked about — the member had no signal or
    never saw the prompt. The approval permission is checked in task-service
    against the entry's own space, like the extra-time routes; the caller's
    readable spaces narrow which entry can be found at all.
  */
  @Post('entries/:id/overtime')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Add approved overtime to a closed shift' })
  async addOvertime(@Param('id') entryId: string, @Body() body: AddOvertimeDto, @Request() req: AuthedRequest) {
    return this.extraTimeGateway.addOvertimeToEntry({
      entryId,
      minutes: body.minutes,
      reason: body.reason ?? null,
      approverId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  /*
    Remove an APPROVED overtime as if it never was: the shift end moves back,
    the day is recounted, the record is deleted. Same permission as approving,
    checked in task-service against the shift's own space.
  */
  @Delete('overtime/:id')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Remove an approved overtime (restores the shift end and recounts the day)' })
  async removeApprovedOvertime(@Param('id') overtimeId: string, @Request() req: AuthedRequest) {
    return this.extraTimeGateway.removeApprovedOvertime({
      overtimeId,
      actorId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  @Post('extra-time/:id/reject')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Reject an extra-time request' })
  async rejectExtraTime(@Param('id') entryId: string, @Body() body: RejectExtraTimeDto, @Request() req: AuthedRequest) {
    return this.extraTimeGateway.rejectExtraTime({
      entryId,
      reason: body?.reason ?? null,
      approverId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }
}
