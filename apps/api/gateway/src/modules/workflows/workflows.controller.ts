import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateWorkflowStatusDto,
  UpdateWorkflowStatusDto,
  ReorderStatusesDto,
  UpsertDefinitionOfDoneDto,
} from './dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows')
@ApiBearerAuth()
@RequirePlan('workflows') // Business+ (write routes; reads pass through)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List organization workflows' })
  async findAll(@Request() req: any) {
    return this.workflowsService.findAll({
      organizationId: req.user.organizationId,
    });
  }

  // ==================== Definition of Done (before :id routes) ====================

  @Get('definition-of-done')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get active Definition of Done for the organization' })
  @ApiQuery({ name: 'workflowId', required: false, description: 'Filter by workflow ID' })
  async getDefinitionOfDone(
    @Query('workflowId') workflowId: string | undefined,
    @Request() req: any,
  ) {
    return this.workflowsService.getDefinitionOfDone({
      organizationId: req.user.organizationId,
      ...(workflowId && { workflowId }),
    });
  }

  @Post('definition-of-done')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create or update a Definition of Done' })
  async upsertDefinitionOfDone(
    @Body() dto: UpsertDefinitionOfDoneDto,
    @Request() req: any,
  ) {
    return this.workflowsService.upsertDefinitionOfDone({
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete('definition-of-done/:dodId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a Definition of Done' })
  async removeDefinitionOfDone(
    @Param('dodId') id: string,
    @Request() req: any,
  ) {
    return this.workflowsService.removeDefinitionOfDone({
      id,
      organizationId: req.user.organizationId,
    });
  }

  // ==================== Workflow CRUD ====================

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a workflow with its statuses' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.findOne({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a new workflow' })
  async create(@Body() dto: CreateWorkflowDto, @Request() req: any) {
    return this.workflowsService.create({
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a workflow' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @Request() req: any,
  ) {
    return this.workflowsService.update({
      id,
      ...dto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a workflow (not if default)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/set-default')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Set workflow as organization default' })
  async setDefault(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.setDefault({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/statuses')
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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
  // ── Which task types a space offers ─────────────────────────────────────────
  //
  // Managing a space's task types is administering that space, so it takes the
  // same permission as the rest of its settings — and RequirePermissionInSpace,
  // so a space's own manager can do it without org-wide rights. The service
  // re-checks the real spaceId; this only widens the gate enough to reach it.

  @Get('spaces/:spaceId')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Task types this space offers, default first' })
  listSpaceWorkflows(@Param('spaceId') spaceId: string, @Request() req: any) {
    return this.workflowsService.listSpaceWorkflows({ spaceId, organizationId: req.user.organizationId });
  }

  @Post('spaces/:spaceId/:workflowId')
  @RequirePermissionInSpace('canManageUsers')
  @ApiOperation({ summary: 'Offer a task type in this space' })
  attachSpaceWorkflow(
    @Param('spaceId') spaceId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: { makeDefault?: boolean },
    @Request() req: any,
  ) {
    return this.workflowsService.attachSpaceWorkflow({
      spaceId,
      workflowId,
      makeDefault: body?.makeDefault,
      organizationId: req.user.organizationId,
    });
  }

  @Delete('spaces/:spaceId/:workflowId')
  @RequirePermissionInSpace('canManageUsers')
  @ApiOperation({ summary: 'Stop offering a task type in this space' })
  detachSpaceWorkflow(
    @Param('spaceId') spaceId: string,
    @Param('workflowId') workflowId: string,
    @Request() req: any,
  ) {
    return this.workflowsService.detachSpaceWorkflow({ spaceId, workflowId, organizationId: req.user.organizationId });
  }

  @Patch('spaces/:spaceId/:workflowId/default')
  @RequirePermissionInSpace('canManageUsers')
  @ApiOperation({ summary: 'Make this the task type new tasks inherit here' })
  setSpaceDefaultWorkflow(
    @Param('spaceId') spaceId: string,
    @Param('workflowId') workflowId: string,
    @Request() req: any,
  ) {
    return this.workflowsService.setSpaceDefaultWorkflow({ spaceId, workflowId, organizationId: req.user.organizationId });
  }
}
