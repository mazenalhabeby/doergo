import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  UpsertDefinitionOfDoneDto,
  UseWorkflowTemplateDto,
  SubmitToLibraryDto,
} from './dto';
import { WorkflowsService } from './workflows.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('workflows')
@ApiBearerAuth()
@RequirePlan('workflows') // Business+ (write routes; reads pass through)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List organization workflows' })
  async findAll(@Request() req: AuthedRequest) {
    return this.workflowsService.findAll({
      organizationId: callerOrgId(req.user),
    });
  }

  // ==================== Task-type library (before :id routes) ================
  //
  // The library is platform-curated and shared by every tenant, so both routes
  // here are one-directional: read what is published, or take a COPY of it. No
  // tenant route writes to it — see the WorkflowTemplate model comment for why a
  // live reference would be unsafe as well as a cross-tenant write.

  @Get('library')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Published task-type templates to start from' })
  async listTemplates(@Request() req: AuthedRequest) {
    return this.workflowsService.listTemplates({ organizationId: callerOrgId(req.user) });
  }

  @Post('library/:templateId')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Copy a library template into this organization' })
  async useTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UseWorkflowTemplateDto,
    @Request() req: AuthedRequest,
  ) {
    // Same permission as creating a task type outright, because that is what
    // this is. The optional space attachment is strictly narrower than what
    // canManageUsers already allows in this organization.
    return this.workflowsService.useTemplate({
      templateId,
      organizationId: callerOrgId(req.user),
      ...(dto?.name ? { name: dto.name } : {}),
      ...(dto?.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto?.spaceId ? { spaceId: dto.spaceId } : {}),
      ...(dto?.shareWithOrganization !== undefined ? { shareWithOrganization: dto.shareWithOrganization } : {}),
    });
  }

  // ==================== Definition of Done (before :id routes) ====================

  @Get('definition-of-done')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get active Definition of Done for the organization' })
  @ApiQuery({ name: 'workflowId', required: false, description: 'Filter by workflow ID' })
  async getDefinitionOfDone(@Query('workflowId') workflowId: string | undefined, @Request() req: AuthedRequest) {
    return this.workflowsService.getDefinitionOfDone({
      organizationId: callerOrgId(req.user),
      ...(workflowId && { workflowId }),
    });
  }

  @Post('definition-of-done')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Create or update a Definition of Done' })
  async upsertDefinitionOfDone(@Body() dto: UpsertDefinitionOfDoneDto, @Request() req: AuthedRequest) {
    return this.workflowsService.upsertDefinitionOfDone({
      ...dto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete('definition-of-done/:dodId')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Delete a Definition of Done' })
  async removeDefinitionOfDone(@Param('dodId') id: string, @Request() req: AuthedRequest) {
    return this.workflowsService.removeDefinitionOfDone({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  // ==================== Workflow CRUD ====================

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a workflow with its statuses' })
  async findOne(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.workflowsService.findOne({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post()
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Create a new workflow' })
  async create(@Body() dto: CreateWorkflowDto, @Request() req: AuthedRequest) {
    const { spaceId, ...rest } = dto as CreateWorkflowDto & { spaceId?: string };
    return this.workflowsService.create({
      ...rest,
      // Named `spaceId` on the way in because that is what a caller has; stored
      // as `ownerSpaceId` because that is what it means once it is a row.
      ...(spaceId ? { ownerSpaceId: spaceId } : {}),
      organizationId: callerOrgId(req.user),
    });
  }

  /**
   * Offer a task type to the shared library.
   *
   * canManageUsers, the same as editing one — but note this only SUBMITS. A
   * curator reads it before any other organization is offered it, because a
   * flow's step names are a business's process and sometimes a person's name.
   */
  @Post(':id/share-with-organization')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: "Widen a space's own task type so any space can offer it" })
  async shareWithOrganization(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.workflowsService.shareWithOrganization({ workflowId: id, organizationId: callerOrgId(req.user) });
  }

  @Post(':id/submit-to-library')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Offer this task type to the shared library (goes to review)' })
  async submitToLibrary(@Param('id') id: string, @Body() dto: SubmitToLibraryDto, @Request() req: AuthedRequest) {
    return this.workflowsService.submitToLibrary({
      workflowId: id,
      organizationId: callerOrgId(req.user),
      ...(dto?.note ? { note: dto.note } : {}),
    });
  }

  @Patch(':id')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Update a workflow' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto, @Request() req: AuthedRequest) {
    return this.workflowsService.update({
      id,
      ...dto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete(':id')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Delete a workflow (not if default)' })
  async remove(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.workflowsService.remove({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post(':id/set-default')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Set workflow as organization default' })
  async setDefault(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.workflowsService.setDefault({
      id,
      organizationId: callerOrgId(req.user),
    });
  }
}
