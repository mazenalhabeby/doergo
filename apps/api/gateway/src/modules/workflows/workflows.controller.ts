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
  UseWorkflowTemplateDto,
  SubmitToLibraryDto,
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

  // ==================== Task-type library (before :id routes) ================
  //
  // The library is platform-curated and shared by every tenant, so both routes
  // here are one-directional: read what is published, or take a COPY of it. No
  // tenant route writes to it — see the WorkflowTemplate model comment for why a
  // live reference would be unsafe as well as a cross-tenant write.

  @Get('library')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Published task-type templates to start from' })
  async listTemplates(@Request() req: any) {
    return this.workflowsService.listTemplates({ organizationId: req.user.organizationId });
  }

  @Post('library/:templateId')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Copy a library template into this organization' })
  async useTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UseWorkflowTemplateDto,
    @Request() req: any,
  ) {
    // Same permission as creating a task type outright, because that is what
    // this is. The optional space attachment is strictly narrower than what
    // canManageUsers already allows in this organization.
    return this.workflowsService.useTemplate({
      templateId,
      organizationId: req.user.organizationId,
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
  @RequirePermission('canManageTaskTypes')
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
  @RequirePermission('canManageTaskTypes')
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
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Create a new workflow' })
  async create(@Body() dto: CreateWorkflowDto, @Request() req: any) {
    const { spaceId, ...rest } = dto as CreateWorkflowDto & { spaceId?: string };
    return this.workflowsService.create({
      ...rest,
      // Named `spaceId` on the way in because that is what a caller has; stored
      // as `ownerSpaceId` because that is what it means once it is a row.
      ...(spaceId ? { ownerSpaceId: spaceId } : {}),
      organizationId: req.user.organizationId,
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
  async shareWithOrganization(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.shareWithOrganization({ workflowId: id, organizationId: req.user.organizationId });
  }

  @Post(':id/submit-to-library')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Offer this task type to the shared library (goes to review)' })
  async submitToLibrary(@Param('id') id: string, @Body() dto: SubmitToLibraryDto, @Request() req: any) {
    return this.workflowsService.submitToLibrary({
      workflowId: id,
      organizationId: req.user.organizationId,
      ...(dto?.note ? { note: dto.note } : {}),
    });
  }

  @Patch(':id')
  @RequirePermission('canManageTaskTypes')
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
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Delete a workflow (not if default)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/set-default')
  @RequirePermission('canManageTaskTypes')
  @ApiOperation({ summary: 'Set workflow as organization default' })
  async setDefault(@Param('id') id: string, @Request() req: any) {
    return this.workflowsService.setDefault({
      id,
      organizationId: req.user.organizationId,
    });
  }

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
  @RequirePermissionInSpace('canManageTaskTypes')
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
  @RequirePermissionInSpace('canManageTaskTypes')
  @ApiOperation({ summary: 'Stop offering a task type in this space' })
  detachSpaceWorkflow(
    @Param('spaceId') spaceId: string,
    @Param('workflowId') workflowId: string,
    @Request() req: any,
  ) {
    return this.workflowsService.detachSpaceWorkflow({ spaceId, workflowId, organizationId: req.user.organizationId });
  }

  @Post('spaces/:spaceId/:workflowId/fork')
  @RequirePermissionInSpace('canManageTaskTypes')
  @ApiOperation({ summary: "Take this space's own copy of a shared task type, so it can diverge" })
  forkForSpace(@Param('spaceId') spaceId: string, @Param('workflowId') workflowId: string, @Request() req: any) {
    return this.workflowsService.forkForSpace({ spaceId, workflowId, organizationId: req.user.organizationId });
  }

  @Patch('spaces/:spaceId/:workflowId/default')
  @RequirePermissionInSpace('canManageTaskTypes')
  @ApiOperation({ summary: 'Make this the task type new tasks inherit here' })
  setSpaceDefaultWorkflow(
    @Param('spaceId') spaceId: string,
    @Param('workflowId') workflowId: string,
    @Request() req: any,
  ) {
    return this.workflowsService.setSpaceDefaultWorkflow({ spaceId, workflowId, organizationId: req.user.organizationId });
  }
}
