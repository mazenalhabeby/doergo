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
import { RequirePermission } from '../../common/decorators';
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
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List organization workflows' })
  async findAll(@Request() req: any) {
    return this.workflowsService.findAll({
      organizationId: req.user.organizationId,
    });
  }

  // ==================== Definition of Done (before :id routes) ====================

  @Get('definition-of-done')
  @Roles(Role.ADMIN, Role.MANAGER)
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
  @Roles(Role.ADMIN, Role.MANAGER)
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
}
