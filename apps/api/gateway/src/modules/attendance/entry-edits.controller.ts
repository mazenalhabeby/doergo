import { Controller, Get, Post, Put, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AddManualEntriesDto } from './dto';
import { AttendanceControllerBase } from './attendance-controller.base';

/** /attendance/entries — correcting, inspecting, deleting and adding entries by hand. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class EntryEditsController extends AttendanceControllerBase {
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
    return this.entryDecisions.editEntry({
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
    return this.entryDecisions.getEntryPresence({
      entryId,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canViewSpaceAttendance'),
    });
  }

  @Get('entries/:id/history')
  @RequirePermissionInSpace('canViewSpaceAttendance')
  @ApiOperation({ summary: 'Get the full edit history for a time entry' })
  async getEntryHistory(@Param('id') entryId: string, @Request() req?: any) {
    return this.entryDecisions.getEntryHistory({
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
    return this.entryDecisions.deleteEntry({
      entryId,
      editorId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canDeleteAttendance'),
    });
  }

  @Post('entries/manual')
  @RequirePermissionInSpace('canReconcileAttendance')
  @ApiOperation({
    summary: 'Admin: add/back-date attendance for an employee (single day, or a weekday-filtered date-range backfill)',
  })
  async addManualEntries(@Body() body: AddManualEntriesDto, @Request() req?: any) {
    return this.entryDecisions.addManualEntries({
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
}
