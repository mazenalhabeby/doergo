import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, RequirePermissionInSpace, OUTSIDE_SHIFT_DECIDE_KEYS } from '@hbcfield/shared';
import {
  listOutsideShift,
  listMyOutsideShift,
  listMyApprovers,
  decideOutsideShift,
} from '@hbcfield/shared/microservices';
import { Roles } from '../../common/decorators/roles.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { ServiceCalls } from '../../common/microservices/service-calls';
import { scopeForAll } from '../../common/permission-scope';
import { callerOrgId } from '../../common/caller-org';
import type { AuthedRequest } from '../../common/request.types';
import { DecideOutsideShiftDto } from './dto/outside-shift.dto';

/**
 * Time worked outside the planned shift (docs/plans/time-counting-model.md, phase 3): ONE decision
 * per entry — count all of it, part of it, or none.
 *
 * Decided by who approves HOURS (clock review A10): counting time after the shift is the payroll
 * sign-off, so the gate is canApproveAttendance, and the scope is the workspaces where the caller holds
 * it AND canApproveOvertime (the overtime it writes is checked again in task-service against the entry's
 * own workspace). A team leader keeps the live extra-time answer, not this.
 */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class OutsideShiftController {
  constructor(private readonly services: ServiceCalls) {}

  @Get('outside/pending')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Time outside the shift waiting for the caller (never their own)' })
  pending(@Request() req: AuthedRequest) {
    return this.services.task.ask(listOutsideShift, {
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeForAll(req.user, OUTSIDE_SHIFT_DECIDE_KEYS),
    });
  }

  // The member's own: what waits, and for whom. An external member holds no clock.
  @Get('outside/mine')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @DenyExternal()
  @ApiOperation({ summary: "The caller's own time outside the shift, waiting for a decision" })
  mine(@Request() req: AuthedRequest) {
    return this.services.task.ask(listMyOutsideShift, { userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  // Who decides the caller's own time today — the phone's clock-out receipt names them (C7). Their own only.
  @Get('approvers/mine')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @DenyExternal()
  @ApiOperation({ summary: "Who decides the caller's own time right now (first three names)" })
  myApprovers(@Request() req: AuthedRequest) {
    return this.services.task.ask(listMyApprovers, { userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  @Post('entries/:id/outside')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePermissionInSpace('canApproveAttendance')
  // No Option (clock review A8): time outside the shift is part of counting time for everybody — the list was
  // always there without it, and an item nobody could decide sat in the inbox for ever (402).
  @ApiOperation({ summary: 'Decide time outside the shift: count N minutes (0 = not counted)' })
  decide(@Param('id') entryId: string, @Body() body: DecideOutsideShiftDto, @Request() req: AuthedRequest) {
    return this.services.task.ask(decideOutsideShift, {
      entryId,
      minutes: body.minutes,
      reason: body.reason ?? null,
      approverId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeForAll(req.user, OUTSIDE_SHIFT_DECIDE_KEYS),
    });
  }
}
