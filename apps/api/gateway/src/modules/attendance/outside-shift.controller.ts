import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, RequirePermissionInSpace } from '@hbcfield/shared';
import { listOutsideShift, listMyOutsideShift, decideOutsideShift } from '@hbcfield/shared/microservices';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { ServiceCalls } from '../../common/microservices/service-calls';
import { scopeFor } from '../../common/permission-scope';
import { callerOrgId } from '../../common/caller-org';
import type { AuthedRequest } from '../../common/request.types';
import { DecideOutsideShiftDto } from './dto/outside-shift.dto';

/**
 * Time worked outside the planned shift (docs/plans/time-counting-model.md, phase 3): ONE decision
 * per entry — count all of it, part of it, or none. The approval permission (canApproveOvertime) is
 * checked in task-service against the entry's own workspace, like the extra-time routes; the scope
 * narrows which entries can be found at all.
 */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class OutsideShiftController {
  constructor(private readonly services: ServiceCalls) {}

  @Get('outside/pending')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: 'Time outside the shift waiting for the caller (never their own)' })
  pending(@Request() req: AuthedRequest) {
    return this.services.task.ask(listOutsideShift, {
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canApproveOvertime'),
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

  @Post('entries/:id/outside')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePermissionInSpace('canApproveOvertime')
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Decide time outside the shift: count N minutes (0 = not counted)' })
  decide(@Param('id') entryId: string, @Body() body: DecideOutsideShiftDto, @Request() req: AuthedRequest) {
    return this.services.task.ask(decideOutsideShift, {
      entryId,
      minutes: body.minutes,
      reason: body.reason ?? null,
      approverId: req.user.id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: scopeFor(req.user, 'canApproveOvertime'),
    });
  }
}
