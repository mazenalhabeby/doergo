import {
  Controller,
  Get,
  Post,
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
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { OvertimeGatewayService } from './overtime.service';
import { OvertimeQueueService } from './overtime.queue.service';
import {
  RespondToOvertimeDto,
  ApproveOvertimeDto,
  ApproveOvertimeSignatureDto,
  RejectOvertimeDto,
} from './dto';

@ApiTags('overtime')
@ApiBearerAuth()
@RequirePlan('overtime') // Professional+ (write routes; reads pass through)
@Controller('overtime')
export class OvertimeController {
  constructor(
    private readonly overtimeService: OvertimeGatewayService,
    private readonly overtimeQueueService: OvertimeQueueService,
  ) {}

  @Get('active')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Get active overtime request for current user' })
  async getActive(@Request() req: any) {
    return this.overtimeService.getActive({ userId: req.user.id });
  }

  @Post('respond')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Respond YES/NO to overtime prompt' })
  async respond(@Body() dto: RespondToOvertimeDto, @Request() req: any) {
    return this.overtimeQueueService.technicianRespond({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/approve')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Approve overtime request remotely (Path A)' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveOvertimeDto,
    @Request() req: any,
  ) {
    return this.overtimeQueueService.leaderApprove({
      overtimeRequestId: id,
      approverId: req.user.id,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/approve-signature')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Approve overtime with leader signature on device (Path B)' })
  async approveSignature(
    @Param('id') id: string,
    @Body() dto: ApproveOvertimeSignatureDto,
    @Request() req: any,
  ) {
    return this.overtimeQueueService.leaderApproveSignature({
      overtimeRequestId: id,
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/reject')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Reject overtime request' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectOvertimeDto,
    @Request() req: any,
  ) {
    return this.overtimeQueueService.leaderReject({
      overtimeRequestId: id,
      approverId: req.user.id,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Get('pending-approvals')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List pending overtime approval requests' })
  async getPendingApprovals(@Request() req: any) {
    return this.overtimeService.getPendingApprovals({
      organizationId: req.user.organizationId,
    });
  }

  @Get('history')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get overtime history' })
  @ApiQuery({ name: 'technicianId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getHistory(
    @Request() req: any,
    @Query('technicianId') technicianId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.overtimeService.getHistory({
      organizationId: req.user.organizationId,
      technicianId,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }
}
