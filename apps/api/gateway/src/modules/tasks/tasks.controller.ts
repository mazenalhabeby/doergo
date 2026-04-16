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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, UpdateStatusDto } from './dto';
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

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    if (!req.user.canCreateTasks) {
      throw new ForbiddenException('You do not have permission to create tasks');
    }

    return this.tasksQueueService.createTask({
      ...createTaskDto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter tasks with dueDate >= startDate (ISO date)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter tasks with dueDate <= endDate (ISO date)' })
  @ApiQuery({ name: 'includeNoDueDate', required: false, description: 'Include tasks without a dueDate (for Current tab)' })
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
      organizationId: req.user.organizationId,
    });
  }

  @Get('counts')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task counts grouped by status' })
  async getStatusCounts(@Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getStatusCounts({
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/suggested-technicians')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get suggested technicians for a task with scoring' })
  async getSuggestedTechnicians(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getSuggestedTechnicians({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Update a task (CLIENT or DISPATCHER)' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req: any) {
    return this.tasksQueueService.updateTask({
      id,
      ...updateTaskDto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Assign a task to a technician (CLIENT or DISPATCHER)' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto, @Request() req: any) {
    return this.tasksQueueService.assignTask({
      id,
      ...assignTaskDto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Update task status (role-based: TECHNICIAN can start/block/complete, CLIENT/DISPATCHER can cancel)' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto, @Request() req: any) {
    return this.tasksQueueService.updateTaskStatus({
      id,
      ...updateStatusDto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/decline')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Decline task assignment (TECHNICIAN only - returns task to dispatcher)' })
  async declineTask(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.declineTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a task (CLIENT only - org owner)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.tasksQueueService.deleteTask({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/timeline')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getTimeline({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/comments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: { content: string }, @Request() req: any) {
    return this.tasksQueueService.addComment({
      taskId: id,
      ...body,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/comments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getComments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============ Attachment Endpoints ============

  @Post(':id/attachments/presign')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
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
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/attachments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
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
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/attachments')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task attachments' })
  async getAttachments(@Param('id') id: string, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getAttachments({
      taskId: id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
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
      organizationId: req.user.organizationId,
    });
  }
}
