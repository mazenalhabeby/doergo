import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, RequireAccessModule } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ClockInDto,
  ClockOutDto,
  HeartbeatDto,
  HeartbeatBatchDto,
  AutoClockConsentDto,
  AutoClockActionDto,
} from './dto';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AllowWhenLocked } from '../../common/guards/subscription.guard';
import { AttendanceService } from './attendance.service';
import { AttendanceQueueService } from './attendance.queue.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceQueueService: AttendanceQueueService,
  ) {}

  @Post('clock-in')
  // Entry point only — clock-out and break-end stay open so removing the tab mid-shift cannot strand an open entry.
  @RequireAccessModule('clock')
  /*
    ⚠️ Time Tracking is the MODULE this feature is sold as, and it was never
    checked: a workspace could clock its people in and out without it being
    switched on. `clock` above is the member's own Access Profile — whether THIS
    person uses a clock — which is a different question from whether the
    workspace bought one.
    ⚠️ On the ENTRY POINT only, for the reason in the line above it: switching
    the module off mid-shift must not leave somebody unable to clock out.
  */
  @RequireModule('time_tracking')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Clock in at a company location' })
  async clockIn(@Body() dto: ClockInDto, @Request() req: AuthedRequest) {
    return this.attendanceQueueService.clockIn({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('clock-out')
  // Ends the caller's own running work — never stranded by a lapsed subscription.
  @AllowWhenLocked()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Clock out from current shift' })
  async clockOut(@Body() dto: ClockOutDto, @Request() req: AuthedRequest) {
    return this.attendanceQueueService.clockOut({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('heartbeat')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Send location heartbeat while clocked in' })
  async heartbeat(@Body() dto: HeartbeatDto, @Request() req: AuthedRequest) {
    return this.attendanceQueueService.heartbeat({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Check-ins a phone kept without signal. Replayed as periods, never as live
    heartbeats — a point from an hour ago must not report somebody "leaving the
    site" now. The caller is the token; points only ever touch their own shift.
  */
  @Post('heartbeat/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Send location check-ins kept while offline' })
  async heartbeatBatch(@Body() dto: HeartbeatBatchDto, @Request() req: AuthedRequest) {
    return this.attendanceQueueService.heartbeatBatch({
      points: dto.points,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current clock-in status' })
  async getStatus(@Request() req: AuthedRequest) {
    return this.attendanceService.getStatus({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  /**
   * Where this member may clock in, right now.
   *
   * Not `GET /locations`, which answers a different question — that one returns
   * the workspaces a member can SEE, and a manager can see the whole directory.
   * Offering a site somebody may look at but is not assigned to produces a
   * clock-in refused for a reason they cannot act on.
   *
   * The caller is always the session; there is no userId parameter, so this
   * cannot be used to enumerate where a colleague works.
   */
  @Get('clock-in-locations')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Workspaces the caller may clock in at right now' })
  async clockInLocations(@Request() req: AuthedRequest) {
    return this.attendanceService.listClockInLocations({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  // ── The automatic clock (shared attendance/auto-clock.ts) ─────────────────
  // Every route is the CALLER's own: no userId parameter, ownership in the
  // service (another member's entry is 404). External members hold no clock.

  /**
   * Where the phone arms geofences for the caller, today and tomorrow, with the
   * planned shifts. Nothing without the member's own consent.
   */
  @Get('auto-clock/plan')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Workspaces the automatic clock arms for the caller' })
  async autoClockPlan(@Request() req: AuthedRequest) {
    return this.attendanceService.autoClockPlan({ userId: req.user.id, organizationId: callerOrgId(req.user) });
  }

  /** The member's own consent to location-based clocking; false withdraws it. */
  @Post('auto-clock/consent')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Give or withdraw consent to the automatic clock' })
  async autoClockConsent(@Body() dto: AutoClockConsentDto, @Request() req: AuthedRequest) {
    return this.attendanceService.autoClockConsent({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      consent: dto.consent,
    });
  }

  /** Undo an automatic clock-in — a drive-past. Idempotent for an offline replay. */
  @Post('entries/:id/auto-undo')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Undo an automatic clock-in (own, within minutes, nothing recorded on it)' })
  async autoClockUndo(@Param('id') entryId: string, @Body() dto: AutoClockActionDto, @Request() req: AuthedRequest) {
    return this.attendanceService.autoClockUndo({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      entryId,
      evidence: dto?.evidence,
    });
  }

  /** "Still working": no automatic rest on this shift. Idempotent. */
  @Post('entries/:id/auto-rest/skip')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Skip the automatic rest on the running shift' })
  async autoClockSkipRest(
    @Param('id') entryId: string,
    @Body() dto: AutoClockActionDto,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.autoClockSkipRest({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
      entryId,
      evidence: dto?.evidence,
    });
  }
}
