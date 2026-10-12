import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  Role,
  RequireAccessModule,
  isAdmin,
  spacesGranting,
  type AccessPermissionKey,
  assertServiceOk,
  clampListLimit,
} from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { attendanceAuthority, type AttendanceNeed } from '../../common/attendance-authority';
import { AttendanceService } from './attendance.service';
import { AttendanceQueueService } from './attendance.queue.service';
import {
  ClockInDto, ClockOutDto, HeartbeatDto, HeartbeatBatchDto, RequestExtraTimeDto, StartBreakDto, EndBreakDto,
  AddBreakForMemberDto, BreakRuleDto, SnoozeBreakDto,
  ApproveExtraTimeDto, RejectExtraTimeDto, AddOvertimeDto,
  AddWorklogNoteDto, AddWorklogNotesBatchDto, PresignWorklogAttachmentDto, ConfirmWorklogAttachmentDto,
  AutoClockConsentDto, AutoClockActionDto,
} from './dto';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AllowWhenLocked } from '../../common/guards/subscription.guard';

@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  /**
   * Which spaces this caller may see attendance for — the list every query
   * narrows to.
   *
   * The guard above only ever WIDENS: none of these routes names a space (they
   * are keyed on entry ids, approval ids, or nothing), so a space-scoped grant
   * satisfies `accessAllowsAnywhere` and would otherwise read every site in the
   * organization. The narrowing has to happen where the query is built, and
   * this is what carries it there.
   *
   * `null` means org-wide — do not narrow. An empty array means granted in no
   * space and must return NOTHING. They are deliberately different values,
   * because collapsing them into one falsy check is precisely how this becomes
   * a data leak.
   */
  private scope(req: any, key: AccessPermissionKey): string[] | null {
    // An admin holds every permission org-wide by being an admin, not by a role
    // — and `access.org` may not spell that out. Never narrowed.
    if (isAdmin(req.user)) return null;
    return spacesGranting(req.user?.access, key);
  }

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
  async clockIn(@Body() dto: ClockInDto, @Request() req: any) {
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
  async clockOut(@Body() dto: ClockOutDto, @Request() req: any) {
    return this.attendanceQueueService.clockOut({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('heartbeat')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Send location heartbeat while clocked in' })
  async heartbeat(@Body() dto: HeartbeatDto, @Request() req: any) {
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
  async heartbeatBatch(@Body() dto: HeartbeatBatchDto, @Request() req: any) {
    return this.attendanceQueueService.heartbeatBatch({
      points: dto.points,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current clock-in status' })
  async getStatus(@Request() req: any) {
    return this.attendanceService.getStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
  async clockInLocations(@Request() req: any) {
    return this.attendanceService.listClockInLocations({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
  async autoClockPlan(@Request() req: any) {
    return this.attendanceService.autoClockPlan({ userId: req.user.id, organizationId: req.user.organizationId });
  }

  /** The member's own consent to location-based clocking; false withdraws it. */
  @Post('auto-clock/consent')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Give or withdraw consent to the automatic clock' })
  async autoClockConsent(@Body() dto: AutoClockConsentDto, @Request() req: any) {
    return this.attendanceService.autoClockConsent({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      consent: dto.consent,
    });
  }

  /** Undo an automatic clock-in — a drive-past. Idempotent for an offline replay. */
  @Post('entries/:id/auto-undo')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Undo an automatic clock-in (own, within minutes, nothing recorded on it)' })
  async autoClockUndo(@Param('id') entryId: string, @Body() dto: AutoClockActionDto, @Request() req: any) {
    return this.attendanceService.autoClockUndo({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      entryId,
      evidence: dto?.evidence,
    });
  }

  /** "Still working": no automatic rest on this shift. Idempotent. */
  @Post('entries/:id/auto-rest/skip')
  @DenyExternal()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Skip the automatic rest on the running shift' })
  async autoClockSkipRest(@Param('id') entryId: string, @Body() dto: AutoClockActionDto, @Request() req: any) {
    return this.attendanceService.autoClockSkipRest({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      entryId,
      evidence: dto?.evidence,
    });
  }

  // ── Session work-log ("what I did today") ──────────────────────────────────
  // Ownership is enforced in the service (a member manages their OWN session's
  // log). Anybody else's: reading needs canViewSpaceAttendance, changing needs
  // canReconcileAttendance — org-wide or in the session's space
  // (common/attendance-authority.ts). Server-resolved, never client-supplied.
  private worklogCaller(req: any, need: AttendanceNeed) {
    const { canManage, spaceIds } = attendanceAuthority(req, need);
    return { organizationId: req.user.organizationId, callerUserId: req.user.id, canManage, manageSpaceIds: spaceIds };
  }

  @Post('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Add a work-log note to an attendance session' })
  async worklogAdd(@Param('entryId') entryId: string, @Body() body: AddWorklogNoteDto, @Request() req: any) {
    return this.attendanceService.worklogAddNote({
      ...this.worklogCaller(req, 'write'),
      timeEntryId: entryId, id: body.id, body: body.body, at: body.at, taskId: body.taskId,
    });
  }

  @Post('entries/:entryId/worklog/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-add work-log notes (offline flush)' })
  async worklogBatch(@Param('entryId') entryId: string, @Body() body: AddWorklogNotesBatchDto, @Request() req: any) {
    return this.attendanceService.worklogAddNotesBatch({
      ...this.worklogCaller(req, 'write'),
      timeEntryId: entryId, notes: body?.notes ?? [],
    });
  }

  @Get('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "An attendance session's work-log (notes + photos)" })
  async worklogList(@Param('entryId') entryId: string, @Request() req: any) {
    return this.attendanceService.worklogList({
      ...this.worklogCaller(req, 'read'),
      timeEntryId: entryId,
    });
  }

  @Delete('worklog/:noteId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log note' })
  async worklogDelete(@Param('noteId') noteId: string, @Request() req: any) {
    return this.attendanceService.worklogDeleteNote({
      ...this.worklogCaller(req, 'write'), noteId,
    });
  }

  @Post('worklog/:noteId/attachments/presign')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Presigned upload URL for a work-log photo/file' })
  async worklogPresign(@Param('noteId') noteId: string, @Body() body: PresignWorklogAttachmentDto, @Request() req: any) {
    return this.attendanceService.worklogPresignAttachment({
      ...this.worklogCaller(req, 'write'),
      noteId, fileName: body?.fileName, mimeType: body?.mimeType,
    });
  }

  @Post('worklog/:noteId/attachments')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Confirm a work-log photo/file upload' })
  async worklogConfirm(@Param('noteId') noteId: string, @Body() body: ConfirmWorklogAttachmentDto, @Request() req: any) {
    return this.attendanceService.worklogConfirmAttachment({
      ...this.worklogCaller(req, 'write'),
      noteId, id: body.id, fileKey: body?.fileKey, fileUrl: body?.fileUrl, fileName: body?.fileName,
      fileSize: body?.fileSize, mimeType: body?.mimeType, width: body?.width, height: body?.height,
    });
  }

  @Delete('worklog/attachments/:attachmentId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log attachment' })
  async worklogDeleteAttachment(@Param('attachmentId') attachmentId: string, @Request() req: any) {
    return this.attendanceService.worklogDeleteAttachment({
      ...this.worklogCaller(req, 'write'), attachmentId,
    });
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get own attendance history' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getHistory({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('entries')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "Today's entries for multiple spaces at once (member-scoped for non-admins)" })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated company-location IDs' })
  @ApiQuery({ name: 'date', required: false, type: String })
  async getLocationEntriesBatch(
    @Query('ids') ids: string,
    @Query('date') date?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getLocationEntriesBatch({
      locationIds: (ids || '').split(',').map((s) => s.trim()).filter(Boolean),
      organizationId: req.user.organizationId,
      date,
      requesterId: req.user.id,
      // Same rule as GET locations/:id/entries — the attendance permission
      // (org-wide, or in that space through an active assignment), never the
      // roster and never "view all tasks". The service narrows per space.
      viewScopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('locations/:id/entries')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get time entries for a location (admins, or members of that space)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Single day (defaults to today) — ignored when startDate/endDate given' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLocationEntries(
    @Param('id') locationId: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?: any,
  ) {
    // The service decides: org-wide canViewSpaceAttendance, or the permission
    // in THIS workspace through an assignment active now (External Supervisor
    // included, External Observer not). Being on the roster is not enough.
    return this.attendanceService.getLocationEntries({
      locationId,
      organizationId: req.user.organizationId,
      date,
      startDate,
      endDate,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy,
      sortOrder,
      requesterId: req.user.id,
      viewScopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      // Cross-org shared spaces whose owner enabled "show attendance".
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? [])
        .filter((s: any) => s.showAttendance)
        .map((s: any) => s.spaceId),
    });
  }

  // =========================================================================
  // ADMIN SCHEDULER ENDPOINTS
  // =========================================================================

  @Get('all-entries')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all time entries for the organization' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Single day (defaults to today) — ignored when startDate/endDate given' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Range start (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Range end (yyyy-MM-dd)' })
  @ApiQuery({ name: 'status', required: false, enum: ['CLOCKED_IN', 'CLOCKED_OUT', 'AUTO_OUT'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllEntries(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Request() req?: any,
  ) {
    const parsedPage = page ? Math.max(1, Number(page) || 1) : 1;
    const parsedLimit = clampListLimit(limit, 20, 500);
    return this.attendanceService.getAllEntries({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      date,
      startDate,
      endDate,
      status,
      search,
      page: parsedPage,
      limit: parsedLimit,
      sortBy,
      sortOrder,
    });
  }

  @Get('active-entries')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Who is clocked in right now (org-wide, date-independent)' })
  async getActiveEntries(@Request() req: any) {
    return this.attendanceService.getActiveEntries({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('no-shows')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Recent no-shows (scheduled shift, no clock-in) for review' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'spaceId', required: false, type: String })
  async listNoShows(@Query('days') days?: number, @Query('spaceId') spaceId?: string, @Request() req?: any) {
    return this.attendanceService.listNoShows({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      days: days ? Math.min(Math.max(1, Number(days) || 7), 60) : 7,
      spaceId: spaceId || undefined,
    });
  }

  @Patch('no-shows/:id')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'Excuse or reopen a no-show' })
  async resolveNoShow(
    @Param('id') id: string,
    @Body() body: { action: 'excuse' | 'reopen'; reason?: string },
    @Request() req: any,
  ) {
    return this.attendanceService.resolveNoShow({
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
      action: body?.action === 'reopen' ? 'reopen' : 'excuse',
      reason: body?.reason,
      excusedById: req.user.id,
    });
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  @Get('reports/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get attendance summary for a date range' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getAttendanceSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getAttendanceSummary({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      userId,
      startDate,
      endDate,
    });
  }

  @Get('reports/weekly')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get weekly attendance report' })
  @ApiQuery({ name: 'weekStartDate', required: false, type: String, description: 'Week start date (defaults to current week)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getWeeklyReport(
    @Query('weekStartDate') weekStartDate?: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getWeeklyReport({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      userId,
      weekStartDate,
    });
  }

  @Get('reports/monthly')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get monthly attendance report' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year (defaults to current)' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Month 1-12 (defaults to current)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async getMonthlyReport(
    @Query('year') year?: number,
    @Query('month') month?: number,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getMonthlyReport({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      userId,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Get('reports/export')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Export attendance data to CSV' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by specific user' })
  async exportToCSV(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.exportToCSV({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      startDate,
      endDate,
      userId,
    });
  }

  // =========================================================================
  // BREAKS
  // =========================================================================

  @Post('breaks/start')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Start a break during current shift' })
  async startBreak(@Body() dto: StartBreakDto, @Request() req: any) {
    return this.attendanceService.startBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
  async snoozeBreak(@Body() dto: SnoozeBreakDto, @Request() req: any) {
    return this.attendanceService.snoozeBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
    @Request() req: any,
    @Query('spaceId') spaceId?: string,
    @Query('shiftId') shiftId?: string,
  ) {
    return this.attendanceService.listBreakRules({
      organizationId: req.user.organizationId,
      spaceId,
      shiftId,
    });
  }

  @Post('break-rules')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Add a planned rest' })
  async createBreakRule(@Body() dto: BreakRuleDto, @Request() req: any) {
    return this.attendanceService.createBreakRule({
      ...dto,
      // Never from the body: the organization is whose token this is.
      organizationId: req.user.organizationId,
      // The guard passes a grant in ANY workspace; the service narrows it to
      // the rule's own workspace (`BreakRulesService.assertMayManage`).
      scopeSpaceIds: this.scope(req, 'canManageWorkspaces'),
    });
  }

  @Patch('break-rules/:id')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Change a planned rest' })
  async updateBreakRule(@Param('id') id: string, @Body() dto: BreakRuleDto, @Request() req: any) {
    return this.attendanceService.updateBreakRule({
      ...dto,
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canManageWorkspaces'),
    });
  }

  @Delete('break-rules/:id')
  @RequireModule('time_tracking')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Remove a planned rest' })
  async deleteBreakRule(@Param('id') id: string, @Request() req: any) {
    return this.attendanceService.deleteBreakRule({
      id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canManageWorkspaces'),
    });
  }

  @Post('breaks/end')
  // Ends the caller's own running work — never stranded by a lapsed subscription.
  @AllowWhenLocked()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'End current break' })
  async endBreak(@Body() dto: EndBreakDto, @Request() req: any) {
    return this.attendanceService.endBreak({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      notes: dto.notes,
      breakId: dto.breakId,
      evidence: dto.evidence,
    });
  }

  @Get('breaks/status')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get current break status' })
  async getBreakStatus(@Request() req: any) {
    return this.attendanceService.getBreakStatus({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('entries/:id/breaks')
  @ApiOperation({ summary: 'Get breaks for a specific time entry' })
  async getBreaksForEntry(@Param('id') timeEntryId: string, @Request() req: any) {
    // No permission gate on the route: a member reads the rests of their own
    // shift. Anybody else's entry is narrowed in the service to the spaces
    // where the caller holds canViewSpaceAttendance — the entry-read rule.
    return this.attendanceService.getBreaksForEntry({
      timeEntryId,
      organizationId: req.user.organizationId,
      requesterId: req.user.id,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('breaks/active')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get all active breaks in the organization' })
  async getActiveBreaks(@Request() req: any) {
    return this.attendanceService.getActiveBreaks({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
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
    @Query('date') date?: string,
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.attendanceService.getBreakHistory({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
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
    @Request() req: any,
  ) {
    const result: any = await this.attendanceService.addBreakForMember({
      timeEntryId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
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
  async deleteBreak(@Param('id') breakId: string, @Request() req: any) {
    const result: any = await this.attendanceService.deleteBreak({
      breakId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
      editorId: req.user.id,
    });
    return assertServiceOk(result);
  }

  @Post('breaks/:id/end')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'End a break manually (manager action)' })
  async endBreakManually(
    @Param('id') breakId: string,
    @Body() body?: { notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.endBreakManually({
      breakId,
      adminId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
      notes: body?.notes,
    });
  }

  @Get('breaks/summary')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get break summary statistics' })
  @ApiQuery({ name: 'startDate', required: true, type: String, description: 'Start date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'endDate', required: true, type: String, description: 'End date (yyyy-MM-dd)' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  async getBreakSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    return this.attendanceService.getBreakSummary({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      startDate,
      endDate,
      userId,
    });
  }

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  @Get('approvals/pending')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get time entries pending approval' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPendingApprovals(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
    /** `true` → `{ total, bySpace }` only, no rows (the home's Crew card). */
    @Query('summary') summary?: string,
  ) {
    return this.attendanceService.getPendingApprovals({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      summary: summary === 'true',
    });
  }

  /*
    Signing off, correcting and erasing are three permissions, not one.

    All of them rode on `canReconcileAttendance`, so the client's supervisor who
    should only put their name to our hours could also rewrite them and delete
    them. Sign-off decisions (approve / reject an entry, bulk approve, approve /
    reject time away from the site) ask `canApproveAttendance`; deleting an entry
    asks `canDeleteAttendance`; correcting stays `canReconcileAttendance`.

    ⚠️ The decorator and the narrowing must ALWAYS name the same key. The guard
    only widens (a grant in any space passes it); `this.scope(req, key)` is what
    keeps the service inside the spaces granting THAT key. A route gated on one
    key and narrowed by another lets a grant in space A act on space B.
    `attendance-decision-keys.spec.ts` reads every route and fails on a mismatch.
  */
  @Post('approvals/:id/approve')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Approve a time entry' })
  async approveEntry(
    @Param('id') entryId: string,
    @Body() body?: { notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.approveEntry({
      entryId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      notes: body?.notes,
    });
  }

  @Post('approvals/:id/reject')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Reject a time entry' })
  async rejectEntry(
    @Param('id') entryId: string,
    @Body() body: { reason: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.rejectEntry({
      entryId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      reason: body.reason,
    });
  }

  // ── Geofence excursion ("out of ring") ────────────────────────────────────

  @Post('excursions/report')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Report a reason + duration for being outside the ring' })
  async reportExcursion(
    @Body() body: { reason: string; requestedMinutes: number },
    @Request() req?: any,
  ) {
    return this.attendanceService.reportExcursion({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      reason: body?.reason,
      requestedMinutes: Number(body?.requestedMinutes),
    });
  }

  @Get('excursions')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'List active out-of-ring requests (approver surface)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'pending', 'approved'] })
  async listExcursions(
    @Query('status') status?: 'active' | 'pending' | 'approved',
    @Request() req?: any,
  ) {
    return this.attendanceService.listExcursions({
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
      status,
    });
  }

  @Patch('excursions/:id/approve')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Approve an out-of-ring request (optionally adjust the granted time)' })
  async approveExcursion(
    @Param('id') excursionId: string,
    @Body() body?: { grantedMinutes?: number },
    @Request() req?: any,
  ) {
    return this.attendanceService.approveExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      grantedMinutes:
        body?.grantedMinutes != null ? Number(body.grantedMinutes) : undefined,
    });
  }

  @Patch('excursions/:id/reject')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Reject an out-of-ring request (clocks the worker out)' })
  async rejectExcursion(@Param('id') excursionId: string, @Request() req?: any) {
    return this.attendanceService.rejectExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
    });
  }

  // ── Shift reminder responses ──────────────────────────────────────────────

  @Post('entries/:id/forgot-clock-out')
  // Ends the caller's own running work — never stranded by a lapsed subscription.
  @AllowWhenLocked()
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Resolve a forgotten clock-out with a self-reported leave time' })
  async resolveForgotClockOut(
    @Param('id') entryId: string,
    @Body() body: { clockOutAt: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.resolveForgotClockOut({
      entryId,
      clockOutAt: body.clockOutAt,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('entries/:id/request-extra-time')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Request to keep working past the shift end (routes to a leader)' })
  async requestExtraTime(@Param('id') entryId: string, @Body() body: RequestExtraTimeDto, @Request() req?: any) {
    return this.attendanceService.requestExtraTime({
      entryId,
      // The moment it was asked — a phone without signal sends it later.
      occurredAt: body?.occurredAt ?? null,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('extra-time/pending')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'List open extra-time requests the caller can approve' })
  async getPendingExtraTime(@Request() req?: any) {
    return this.attendanceService.listPendingExtraTime({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
    @Request() req?: any,
  ) {
    return this.attendanceService.approveExtraTime({
      entryId,
      minutes: body.minutes,
      // The signature is stored exactly as drawn and bound to the round. It is
      // EVIDENCE, never authority: the right to approve comes from the token
      // this call was made with, checked again in task-service.
      signature: body.signature ?? null,
      notes: body.notes ?? null,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
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
  async addOvertime(@Param('id') entryId: string, @Body() body: AddOvertimeDto, @Request() req?: any) {
    return this.attendanceService.addOvertimeToEntry({
      entryId,
      minutes: body.minutes,
      reason: body.reason ?? null,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
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
  async removeApprovedOvertime(@Param('id') overtimeId: string, @Request() req?: any) {
    return this.attendanceService.removeApprovedOvertime({
      overtimeId,
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  @Post('extra-time/:id/reject')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @RequirePlan('shift_scheduling')
  @ApiOperation({ summary: 'Reject an extra-time request' })
  async rejectExtraTime(
    @Param('id') entryId: string,
    @Body() body: RejectExtraTimeDto,
    @Request() req?: any,
  ) {
    return this.attendanceService.rejectExtraTime({
      entryId,
      reason: body?.reason ?? null,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Put('entries/:id/edit')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({ summary: 'Edit a time entry (manager correction)' })
  async editEntry(
    @Param('id') entryId: string,
    @Body() body: {
      clockInAt?: string;
      clockOutAt?: string;
      notes?: string;
      timezone?: string;
      reason: string;
    },
    @Request() req?: any,
  ) {
    return this.attendanceService.editEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
      clockInAt: body.clockInAt,
      clockOutAt: body.clockOutAt,
      notes: body.notes,
      timezone: body.timezone,
      reason: body.reason,
    });
  }

  /*
    Where somebody worked through the day. The same gate and the same space
    scope as the edit history beside it: this is attendance detail about a
    person, and outside the caller's spaces it does not exist.
  */
  @Get('entries/:id/presence')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Where a member worked through one entry: on site, in the field or remote' })
  async getEntryPresence(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.getEntryPresence({
      entryId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('entries/:id/history')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get the full edit history for a time entry' })
  async getEntryHistory(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.getEntryHistory({
      entryId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  // Erasing a shift is its own permission: a correction leaves a record and a
  // history, a delete leaves neither, so correcting must not imply it.
  @Delete('entries/:id')
  @RequirePermissionInSpace('canDeleteAttendance')
  @ApiOperation({ summary: 'Delete a time entry (admin)' })
  async deleteEntry(@Param('id') entryId: string, @Request() req?: any) {
    return this.attendanceService.deleteEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canDeleteAttendance'),
    });
  }

  @Post('entries/manual')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({
    summary:
      'Admin: add/back-date attendance for an employee (single day, or a weekday-filtered date-range backfill)',
  })
  async addManualEntries(
    @Body()
    body: {
      userId: string;
      locationId: string;
      startDate: string;
      endDate: string;
      weekdays?: number[];
      startTime: string;
      endTime: string;
      // The break as the dialogs describe it. `breakMinutes` stays for clients
      // that have not taken the update — the service turns it into the same row.
      breakStart?: string;
      breakEnd?: string;
      breakType?: 'SHORT' | 'LUNCH' | 'OTHER';
      breakReason?: string;
      breakMinutes?: number;
      notes?: string;
      reason?: string;
    },
    @Request() req?: any,
  ) {
    return this.attendanceService.addManualEntries({
      userId: body.userId,
      locationId: body.locationId,
      startDate: body.startDate,
      endDate: body.endDate,
      weekdays: body.weekdays,
      startTime: body.startTime,
      endTime: body.endTime,
      breakStart: body.breakStart,
      breakEnd: body.breakEnd,
      breakType: body.breakType,
      breakReason: body.breakReason,
      breakMinutes: body.breakMinutes,
      notes: body.notes,
      reason: body.reason,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canReconcileAttendance'),
    });
  }

  @Post('approvals/bulk-approve')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Bulk approve multiple time entries' })
  async bulkApprove(
    @Body() body: { entryIds: string[]; notes?: string },
    @Request() req?: any,
  ) {
    return this.attendanceService.bulkApprove({
      entryIds: body.entryIds,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      notes: body.notes,
    });
  }
}
