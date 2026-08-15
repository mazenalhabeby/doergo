import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ShiftIssuesService } from './shift-issues.service';

@Controller('shift-issues')
@Roles(Role.ADMIN, Role.EMPLOYEE)
export class ShiftIssuesController {
  constructor(private readonly service: ShiftIssuesService) {}

  // Managers/admins (responsible parties) — used for list scope + write gating.
  private canManage(req: any) {
    return !!(req.user?.canManageUsers || req.user?.canViewAllTasks);
  }
  private ctx(req: any) {
    return { organizationId: req.user?.organizationId, callerUserId: req.user?.id, canManage: this.canManage(req) };
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create({ ...this.ctx(req), ...body });
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
  message(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.message({ ...this.ctx(req), issueId: id, ...body });
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @Request() req: any) {
    return this.service.acknowledge({ ...this.ctx(req), issueId: id });
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { assignToId: string }, @Request() req: any) {
    return this.service.assign({ ...this.ctx(req), issueId: id, assignToId: body.assignToId });
  }

  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: string; note?: string }, @Request() req: any) {
    return this.service.setStatus({ ...this.ctx(req), issueId: id, status: body.status, note: body.note });
  }

  @Post(':id/attachments/presign')
  presign(@Param('id') id: string, @Body() body: { fileName: string; mimeType: string }, @Request() req: any) {
    return this.service.presign({ ...this.ctx(req), issueId: id, fileName: body.fileName, mimeType: body.mimeType });
  }
}
