import { Controller, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { CreateWorkflowStatusDto, UpdateWorkflowStatusDto, ReorderStatusesDto } from './dto';
import { WorkflowsService } from './workflows.service';

/** /workflows/:id/statuses — a workflow's steps: adding, ordering, editing, removing. */
@ApiTags('workflows')
@ApiBearerAuth()
@RequirePlan('workflows')
@Controller('workflows')
export class WorkflowStepsController {


  constructor(
    private readonly workflowsService: WorkflowsService,
  ) {}


  @Post(':id/statuses')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Add a status to a workflow' })
  async addStatus(
    @Param('id') workflowId: string,
    @Body() dto: CreateWorkflowStatusDto,
    @Request() req: any,
  ) {
    return this.workflowsService.addStatus({
      workflowId,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/statuses/reorder')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Reorder all statuses in a workflow' })
  async reorderStatuses(
    @Param('id') workflowId: string,
    @Body() dto: ReorderStatusesDto,
    @Request() req: any,
  ) {
    return this.workflowsService.reorderStatuses({
      workflowId,
      statusIds: dto.statusIds,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/statuses/:statusId')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Update a status in a workflow' })
  async updateStatus(
    @Param('id') workflowId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateWorkflowStatusDto,
    @Request() req: any,
  ) {
    return this.workflowsService.updateStatus({
      workflowId,
      statusId,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/statuses/:statusId')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Delete a status from a workflow' })
  async removeStatus(
    @Param('id') workflowId: string,
    @Param('statusId') statusId: string,
    @Request() req: any,
  ) {
    return this.workflowsService.removeStatus({
      workflowId,
      statusId,
      organizationId: req.user.organizationId,
    });
  }
}
