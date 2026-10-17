import { Controller, Get, Post, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { BulkApproveEntriesDto } from './dto';
import { AttendanceControllerBase } from './attendance-controller.base';

/** /attendance — approving hours and away-from-site excursions. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceApprovalsController extends AttendanceControllerBase {
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
    return this.entryDecisions.getPendingApprovals({
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
  async approveEntry(@Param('id') entryId: string, @Body() body?: { notes?: string }, @Request() req?: any) {
    return this.entryDecisions.approveEntry({
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
  async rejectEntry(@Param('id') entryId: string, @Body() body: { reason: string }, @Request() req?: any) {
    return this.entryDecisions.rejectEntry({
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
  async reportExcursion(@Body() body: { reason: string; requestedMinutes: number }, @Request() req?: any) {
    return this.entryDecisions.reportExcursion({
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
  async listExcursions(@Query('status') status?: 'active' | 'pending' | 'approved', @Request() req?: any) {
    return this.entryDecisions.listExcursions({
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
    return this.entryDecisions.approveExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      grantedMinutes: body?.grantedMinutes != null ? Number(body.grantedMinutes) : undefined,
    });
  }

  @Patch('excursions/:id/reject')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Reject an out-of-ring request (clocks the worker out)' })
  async rejectExcursion(@Param('id') excursionId: string, @Request() req?: any) {
    return this.entryDecisions.rejectExcursion({
      excursionId,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
    });
  }

  @Post('approvals/bulk-approve')
  @RequirePermissionInSpace('canApproveAttendance')
  @ApiOperation({ summary: 'Bulk approve multiple time entries' })
  async bulkApprove(@Body() body: BulkApproveEntriesDto, @Request() req?: any) {
    return this.entryDecisions.bulkApprove({
      entryIds: body.entryIds,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveAttendance'),
      notes: body.notes,
    });
  }
}
