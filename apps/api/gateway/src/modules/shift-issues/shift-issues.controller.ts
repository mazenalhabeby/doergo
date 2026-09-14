import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { Role, spacesGranting } from '@hbcfield/shared';
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

  // Managers/admins (responsible parties) — used for list scope + write gating.
  private canManage(req: any) {
    return !!(req.user?.canManageUsers || req.user?.canViewAllTasks);
  }
  /*
    The spaces where this caller oversees the work.

    `canManage` reads the FLAT org columns, so a member whose authority comes
    from a space counted as nobody here: a supervisor was notified the moment
    somebody on their site hit a blocker, and then saw an empty list, because
    the issue was neither reported by them nor assigned to them. Their spaces
    travel with the request and the service widens the query by them —
    server-resolved, never client-supplied.
  */
  private ledSpaces(req: any): string[] | undefined {
    if (this.canManage(req)) return undefined; // already org-wide
    return spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined;
  }
  private ctx(req: any) {
    return {
      organizationId: req.user?.organizationId,
      callerUserId: req.user?.id,
      canManage: this.canManage(req),
      ledSpaceIds: this.ledSpaces(req),
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
      ...this.ctx(req),
    });
  }

  @Get()
  list(@Query('status') status: string, @Query('scope') scope: string, @Request() req: any) {
    return this.service.list({ ...this.ctx(req), status, scope });
  }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.service.get({ ...this.ctx(req), issueId: id });
  }

  @Post(':id/messages')
  message(@Param('id') id: string, @Body() body: ShiftIssueMessageDto, @Request() req: any) {
    return this.service.message({ id: body.id, body: body.body, attachments: body.attachments, issueId: id, ...this.ctx(req) });
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @Request() req: any) {
    return this.service.acknowledge({ ...this.ctx(req), issueId: id });
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: AssignShiftIssueDto, @Request() req: any) {
    return this.service.assign({ ...this.ctx(req), issueId: id, assignToId: body.assignToId });
  }

  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: ShiftIssueStatusDto, @Request() req: any) {
    return this.service.setStatus({ ...this.ctx(req), issueId: id, status: body.status, note: body.note });
  }

  @Post(':id/attachments/presign')
  presign(@Param('id') id: string, @Body() body: PresignShiftIssueAttachmentDto, @Request() req: any) {
    return this.service.presign({ ...this.ctx(req), issueId: id, fileName: body.fileName, mimeType: body.mimeType });
  }
}
