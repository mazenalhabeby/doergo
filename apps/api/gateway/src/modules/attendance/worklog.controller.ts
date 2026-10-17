import { Controller, Get, Post, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { attendanceAuthority, type AttendanceNeed } from '../../common/attendance-authority';
import {
  AddWorklogNoteDto,
  AddWorklogNotesBatchDto,
  PresignWorklogAttachmentDto,
  ConfirmWorklogAttachmentDto,
} from './dto';
import { AttendanceControllerBase } from './attendance-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** /attendance — the work log on a shift: notes and their attachments. */
@ApiTags('attendance')
@ApiBearerAuth()
@Controller('attendance')
export class WorklogController extends AttendanceControllerBase {
  // ── Session work-log ("what I did today") ──────────────────────────────────
  // Ownership is enforced in the service (a member manages their OWN session's
  // log). Anybody else's: reading needs canViewSpaceAttendance, changing needs
  // canReconcileAttendance — org-wide or in the session's space
  // (common/attendance-authority.ts). Server-resolved, never client-supplied.
  private worklogCaller(req: AuthedRequest, need: AttendanceNeed) {
    const { canManage, spaceIds } = attendanceAuthority(req, need);
    return { organizationId: callerOrgId(req.user), callerUserId: req.user.id, canManage, manageSpaceIds: spaceIds };
  }

  @Post('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Add a work-log note to an attendance session' })
  async worklogAdd(@Param('entryId') entryId: string, @Body() body: AddWorklogNoteDto, @Request() req: AuthedRequest) {
    return this.attendanceService.worklogAddNote({
      ...this.worklogCaller(req, 'write'),
      timeEntryId: entryId,
      id: body.id,
      body: body.body,
      at: body.at,
      taskId: body.taskId,
    });
  }

  @Post('entries/:entryId/worklog/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-add work-log notes (offline flush)' })
  async worklogBatch(
    @Param('entryId') entryId: string,
    @Body() body: AddWorklogNotesBatchDto,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.worklogAddNotesBatch({
      ...this.worklogCaller(req, 'write'),
      timeEntryId: entryId,
      notes: body?.notes ?? [],
    });
  }

  @Get('entries/:entryId/worklog')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: "An attendance session's work-log (notes + photos)" })
  async worklogList(@Param('entryId') entryId: string, @Request() req: AuthedRequest) {
    return this.attendanceService.worklogList({
      ...this.worklogCaller(req, 'read'),
      timeEntryId: entryId,
    });
  }

  @Delete('worklog/:noteId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log note' })
  async worklogDelete(@Param('noteId') noteId: string, @Request() req: AuthedRequest) {
    return this.attendanceService.worklogDeleteNote({
      ...this.worklogCaller(req, 'write'),
      noteId,
    });
  }

  @Post('worklog/:noteId/attachments/presign')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Presigned upload URL for a work-log photo/file' })
  async worklogPresign(
    @Param('noteId') noteId: string,
    @Body() body: PresignWorklogAttachmentDto,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.worklogPresignAttachment({
      ...this.worklogCaller(req, 'write'),
      noteId,
      fileName: body?.fileName,
      mimeType: body?.mimeType,
    });
  }

  @Post('worklog/:noteId/attachments')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Confirm a work-log photo/file upload' })
  async worklogConfirm(
    @Param('noteId') noteId: string,
    @Body() body: ConfirmWorklogAttachmentDto,
    @Request() req: AuthedRequest,
  ) {
    return this.attendanceService.worklogConfirmAttachment({
      ...this.worklogCaller(req, 'write'),
      noteId,
      id: body.id,
      fileKey: body?.fileKey,
      fileUrl: body?.fileUrl,
      fileName: body?.fileName,
      fileSize: body?.fileSize,
      mimeType: body?.mimeType,
      width: body?.width,
      height: body?.height,
    });
  }

  @Delete('worklog/attachments/:attachmentId')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Delete a work-log attachment' })
  async worklogDeleteAttachment(@Param('attachmentId') attachmentId: string, @Request() req: AuthedRequest) {
    return this.attendanceService.worklogDeleteAttachment({
      ...this.worklogCaller(req, 'write'),
      attachmentId,
    });
  }
}
