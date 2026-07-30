import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, canCreateTaskFor, minTierForFeature } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { isFeatureEntitled } from '../../common/entitlements';
import {
  CreateTaskDto,
  UpdateTaskDto,
  AssignTaskDto,
  UpdateStatusDto,
  AddAssigneeDto,
  AddChecklistItemDto,
  UpdateChecklistItemDto,
  ReorderChecklistDto,
  CreateDependencyDto,
  AddCommentDto,
} from './dto';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';

/**
 * Normalize query parameters to handle HTTP parameter pollution.
 * When multiple values are sent for the same parameter (e.g., ?status=NEW&status=COMPLETED),
 * NestJS creates an array. This function takes the first value to prevent errors.
 */
function normalizeQueryParams(query: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksQueueService: TasksQueueService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Closes the "set a premium field via the plain task endpoint" backdoor: the
   * dedicated sprints/epics/phases controllers are gated, but sprintId/epicId/
   * phaseId/storyPoints also flow through create/update. Reject (402) any
   * premium field the org's tier/modules don't entitle. DRY via isFeatureEntitled.
   */
  private assertTaskFieldEntitlements(user: any, dto: { sprintId?: string; epicId?: string; phaseId?: string; storyPoints?: number }) {
    const checks: Array<[unknown, string]> = [
      [dto.sprintId, 'sprints'],
      [dto.epicId, 'epics'],
      [dto.phaseId, 'phases'],
      [dto.storyPoints, 'story_points'],
    ];
    for (const [value, feature] of checks) {
      if (value !== undefined && value !== null && value !== '' && !isFeatureEntitled(user, feature)) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            message: `The "${feature}" feature is not available on your plan.`,
            error: 'PlanUpgradeRequired',
            feature,
            requiredTier: minTierForFeature(feature),
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
  }

  @Post()
  @RequirePermission('canCreateTasks')
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    this.assertTaskFieldEntitlements(req.user, createTaskDto);
    const scope = req.user.taskCreationScope || 'NONE';

    // NONE scope cannot create tasks (should be caught by canCreateTasks guard, but double-check)
    if (scope === 'NONE') {
      throw new ForbiddenException('You do not have permission to create tasks.');
    }

    // SELF scope: force assignedToId to the current user
    if (scope === 'SELF') {
      createTaskDto.assignedToId = req.user.id;
    }

    // SPACE scope: assignee validation is handled by the task-service (space membership check)
    // ORG scope: no restrictions on assignee

    return this.tasksQueueService.createTask({
      ...createTaskDto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('resync/:spaceId')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Re-sync a space's existing tasks onto the space's workflow (ADMIN only)",
  })
  async resyncSpaceWorkflow(@Param('spaceId') spaceId: string, @Request() req: any) {
    return this.tasksService.resyncSpaceWorkflow({
      spaceId,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter tasks with dueDate >= startDate (ISO date)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter tasks with dueDate <= endDate (ISO date)' })
  @ApiQuery({ name: 'includeNoDueDate', required: false, description: 'Include tasks without a dueDate (for Current tab)' })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter by space (CompanyLocation) ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>, @Request() req: any) {
    // Normalize query params to handle HTTP parameter pollution (multiple values for same param)
    const normalizedQuery = normalizeQueryParams(query);

    // Sanitize pagination params before forwarding to microservice
    const page = normalizedQuery.page
      ? Math.max(1, Number(normalizedQuery.page) || 1)
      : 1;
    const limit = Math.min(
      normalizedQuery.limit ? Math.max(1, Number(normalizedQuery.limit) || 20) : 20,
      500,
    );

    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findAll({
      ...normalizedQuery,
      page,
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get task counts grouped by status' })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Filter counts by space (CompanyLocation) ID' })
  async getStatusCounts(@Query('spaceId') spaceId: string | undefined, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getStatusCounts({
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
      ...(spaceId && { spaceId }),
    });
  }

  @Get(':id/suggested-employees')
  @RequirePermission('canAssignTasks')
  @ApiOperation({ summary: 'Get suggested employees for a task with scoring' })
  async getSuggestedEmployees(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getSuggestedEmployees({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Put(':id')
  @RequirePermission('canCreateTasks')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req: any) {
    this.assertTaskFieldEntitlements(req.user, updateTaskDto);
    return this.tasksQueueService.updateTask({
      id,
      ...updateTaskDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/assign')
  @RequirePermission('canAssignTasks')
  @ApiOperation({ summary: 'Assign a task to an employee' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto, @Request() req: any) {
    return this.tasksQueueService.assignTask({
      id,
      ...assignTaskDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update task status (role-based: EMPLOYEE can start/block/complete, others can cancel)' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto, @Request() req: any) {
    return this.tasksQueueService.updateTaskStatus({
      id,
      ...updateStatusDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline task assignment (assigned user)' })
  async declineTask(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.declineTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a task (ADMIN only)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.deleteTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getTimeline({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: AddCommentDto, @Request() req: any) {
    return this.tasksQueueService.addComment({
      taskId: id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getComments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Assignee Endpoints ============

  @Post(':id/assignees')
  @RequirePermission('canAssignTasks')
  @ApiOperation({ summary: 'Add an assignee to a task' })
  async addAssignee(
    @Param('id') id: string,
    @Body() addAssigneeDto: AddAssigneeDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addAssignee({
      taskId: id,
      ...addAssigneeDto,
      requestUserId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/assignees/:userId')
  @RequirePermission('canAssignTasks')
  @ApiOperation({ summary: 'Remove an assignee from a task' })
  async removeAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.removeAssignee({
      taskId: id,
      userId,
      requestUserId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Checklist Endpoints ============

  @Post(':id/checklist')
  @ApiOperation({ summary: 'Add a checklist item to a task' })
  async addChecklistItem(
    @Param('id') id: string,
    @Body() addChecklistItemDto: AddChecklistItemDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addChecklistItem({
      taskId: id,
      ...addChecklistItemDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/checklist/reorder')
  @ApiOperation({ summary: 'Reorder checklist items' })
  async reorderChecklist(
    @Param('id') id: string,
    @Body() reorderChecklistDto: ReorderChecklistDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.reorderChecklist({
      taskId: id,
      ...reorderChecklistDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Update a checklist item (text or toggle completion)' })
  async updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() updateChecklistItemDto: UpdateChecklistItemDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.updateChecklistItem({
      taskId: id,
      itemId,
      ...updateChecklistItemDto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.deleteChecklistItem({
      taskId: id,
      itemId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Subtask Endpoints ============

  @Post(':id/subtasks')
  @RequirePermission('canCreateTasks')
  @ApiOperation({ summary: 'Create a subtask under a task' })
  async createSubtask(
    @Param('id') id: string,
    @Body() createTaskDto: CreateTaskDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.createSubtask({
      ...createTaskDto,
      parentId: id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/subtasks')
  @ApiOperation({ summary: 'Get subtasks of a task' })
  async getSubtasks(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.getSubtasks({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Dependency Endpoints ============

  @Post(':id/dependencies')
  @RequirePermission('canCreateTasks')
  @RequirePlan('dependencies') // Professional+
  @ApiOperation({ summary: 'Add a dependency to a task (this task becomes the successor)' })
  async addDependency(
    @Param('id') id: string,
    @Body() createDependencyDto: CreateDependencyDto,
    @Request() req: any,
  ) {
    return this.tasksQueueService.addDependency({
      ...createDependencyDto,
      successorId: id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/dependencies/:depId')
  @RequirePermission('canCreateTasks')
  @RequirePlan('dependencies') // Professional+
  @ApiOperation({ summary: 'Remove a dependency from a task' })
  async removeDependency(
    @Param('id') _id: string,
    @Param('depId') depId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.removeDependency({
      dependencyId: depId,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Attachment Endpoints ============

  @Post(':id/attachments/presign')
  @ApiOperation({ summary: 'Get presigned URL for uploading an attachment' })
  async getPresignedUrl(
    @Param('id') id: string,
    @Body() body: { fileName: string; fileType: string },
    @Request() req: any,
  ) {
    return this.tasksQueueService.getPresignedUrl({
      taskId: id,
      fileName: body.fileName,
      fileType: body.fileType,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Confirm attachment upload after S3 upload' })
  async addAttachment(
    @Param('id') id: string,
    @Body() body: { fileName: string; fileUrl: string; fileType: string; fileSize: number },
    @Request() req: any,
  ) {
    return this.tasksQueueService.addAttachment({
      taskId: id,
      fileName: body.fileName,
      fileUrl: body.fileUrl,
      fileType: body.fileType,
      fileSize: body.fileSize,
      uploadedById: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Get task attachments' })
  async getAttachments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getAttachments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req: any,
  ) {
    return this.tasksQueueService.deleteAttachment({
      id: attachmentId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canAssignTasks: req.user.canAssignTasks,
      organizationId: req.user.organizationId,
    });
  }
}
