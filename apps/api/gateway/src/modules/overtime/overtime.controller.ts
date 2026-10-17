import { Controller, Get, Post, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role, type AccessPermissionKey } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { OvertimeGatewayService } from './overtime.service';
import { OvertimeQueueService } from './overtime.queue.service';
import { RespondToOvertimeDto, ApproveOvertimeDto, ApproveOvertimeSignatureDto, RejectOvertimeDto } from './dto';
import { scopeFor } from '../../common/permission-scope';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('overtime')
@ApiBearerAuth()
@RequirePlan('overtime') // Professional+ (write routes; reads pass through)
@Controller('overtime')
export class OvertimeController {
  /**
   * Which spaces this caller may act in — see the attendance controller, which
   * carries the full reasoning. OvertimeRequest names its own `locationId`, so
   * the service narrows on that.
   */
  private scope(req: AuthedRequest, key: AccessPermissionKey): string[] | null {
    return scopeFor(req.user, key);
  }

  constructor(
    private readonly overtimeService: OvertimeGatewayService,
    private readonly overtimeQueueService: OvertimeQueueService,
  ) {}

  @Get('active')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get active overtime request for current user' })
  async getActive(@Request() req: AuthedRequest) {
    return this.overtimeService.getActive({ userId: req.user.id });
  }

  @Post('respond')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Respond YES/NO to overtime prompt' })
  async respond(@Body() dto: RespondToOvertimeDto, @Request() req: AuthedRequest) {
    return this.overtimeQueueService.technicianRespond({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/approve')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: 'Approve overtime request remotely (Path A)' })
  async approve(@Param('id') id: string, @Body() dto: ApproveOvertimeDto, @Request() req: AuthedRequest) {
    return this.overtimeQueueService.leaderApprove({
      ...dto,
      overtimeRequestId: id,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  @Post(':id/approve-signature')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Approve overtime with leader signature on device (Path B)' })
  async approveSignature(
    @Param('id') id: string,
    @Body() dto: ApproveOvertimeSignatureDto,
    @Request() req: AuthedRequest,
  ) {
    return this.overtimeQueueService.leaderApproveSignature({
      overtimeRequestId: id,
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/reject')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: 'Reject overtime request' })
  async reject(@Param('id') id: string, @Body() dto: RejectOvertimeDto, @Request() req: AuthedRequest) {
    return this.overtimeQueueService.leaderReject({
      ...dto,
      overtimeRequestId: id,
      approverId: req.user.id,
      organizationId: req.user.organizationId,
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  @Get('pending-approvals')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: 'List pending overtime approval requests' })
  async getPendingApprovals(@Request() req: AuthedRequest) {
    return this.overtimeService.getPendingApprovals({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }

  @Get('history')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({
    summary: 'Every round of overtime, newest first (optionally in a period, a workspace, for one person)',
  })
  @ApiQuery({ name: 'technicianId', required: false })
  @ApiQuery({ name: 'spaceId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getHistory(
    @Request() req: AuthedRequest,
    @Query('technicianId') technicianId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('spaceId') spaceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.overtimeService.getHistory({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
      technicianId,
      spaceId: spaceId || undefined,
      status,
      from: from || undefined,
      to: to || undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('summary')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: "The period's overtime: totals, who is running now, and per person" })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'spaceId', required: false })
  @ApiQuery({ name: 'technicianId', required: false })
  async getSummary(
    @Request() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('spaceId') spaceId?: string,
    @Query('technicianId') technicianId?: string,
  ) {
    return this.overtimeService.getSummary({
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
      from: from || undefined,
      to: to || undefined,
      spaceId: spaceId || undefined,
      technicianId: technicianId || undefined,
    });
  }

  // ⚠️ LAST: a parameter route declared before 'history', 'summary' or 'active' would swallow them.
  @Get(':id')
  @RequirePermissionInSpace('canApproveOvertime')
  @ApiOperation({ summary: "One round in full: its shift's other rounds and the signature" })
  async getRound(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.overtimeService.getRound({
      id,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: this.scope(req, 'canApproveOvertime'),
    });
  }
}
