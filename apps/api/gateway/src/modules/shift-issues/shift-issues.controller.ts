import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { attendanceAuthority, type AttendanceNeed } from '../../common/attendance-authority';
import { Roles } from '../../common/decorators/roles.decorator';
import { ShiftIssuesService } from './shift-issues.service';
import {
  AssignShiftIssueDto,
  CreateShiftIssueDto,
  PresignShiftIssueAttachmentDto,
  ShiftIssueMessageDto,
  ShiftIssueStatusDto,
} from './dto';

@Controller('shift-issues')
@Roles(Role.ADMIN, Role.EMPLOYEE)
export class ShiftIssuesController {
  constructor(private readonly service: ShiftIssuesService) {}

  /*
    Who the caller is to somebody ELSE's issue. Their own (reported by them,
    assigned to them) is decided in the service by `callerUserId`.

    This read the flat org columns (`canManageUsers || canViewAllTasks`), a
    private copy of the work log's rule that asked neither attendance
    permission. Resolved access now (common/attendance-authority.ts): reading
    needs canViewSpaceAttendance, acting needs canReconcileAttendance —
    `canManage` when held org-wide, otherwise the spaces it is held in travel as
    `ledSpaceIds` and the service widens by exactly those.
  */
  private ctx(req: any, need: AttendanceNeed) {
    const { canManage, spaceIds } = attendanceAuthority(req, need);
    return {
      organizationId: req.user?.organizationId,
      callerUserId: req.user?.id,
      canManage,
      ledSpaceIds: spaceIds,
    };
  }

  @Post()
  create(@Body() body: CreateShiftIssueDto, @Request() req: any) {
    return this.service.create({
      id: body.id,
      title: body.title,
      description: body.description,
      severity: body.severity,
      timeEntryId: body.timeEntryId,
      spaceId: body.spaceId,
      // Last, so nothing in the body can stand in for who is asking.
      ...this.ctx(req, 'write'),
    });
  }

  @Get()
  list(@Query('status') status: string, @Query('scope') scope: string, @Request() req: any) {
    return this.service.list({ ...this.ctx(req, 'read'), status, scope });
  }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.service.get({ ...this.ctx(req, 'read'), issueId: id });
  }

  @Post(':id/messages')
  message(@Param('id') id: string, @Body() body: ShiftIssueMessageDto, @Request() req: any) {
    return this.service.message({ id: body.id, body: body.body, attachments: body.attachments, issueId: id, ...this.ctx(req, 'write') });
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @Request() req: any) {
    return this.service.acknowledge({ ...this.ctx(req, 'write'), issueId: id });
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: AssignShiftIssueDto, @Request() req: any) {
    return this.service.assign({ ...this.ctx(req, 'write'), issueId: id, assignToId: body.assignToId });
  }

  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: ShiftIssueStatusDto, @Request() req: any) {
    return this.service.setStatus({ ...this.ctx(req, 'write'), issueId: id, status: body.status, note: body.note });
  }

  @Post(':id/attachments/presign')
  presign(@Param('id') id: string, @Body() body: PresignShiftIssueAttachmentDto, @Request() req: any) {
    return this.service.presign({ ...this.ctx(req, 'write'), issueId: id, fileName: body.fileName, mimeType: body.mimeType });
  }
}
