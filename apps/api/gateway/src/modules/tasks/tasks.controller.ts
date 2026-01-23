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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, UpdateStatusDto } from './dto';
import { TasksQueueService } from './tasks.queue.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksQueueService: TasksQueueService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Create a new task (CLIENT or DISPATCHER)' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    return this.tasksQueueService.createTask({
      ...createTaskDto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>, @Request() req: any) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.findAll({
      ...query,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get('counts')
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
  @Roles(Role.CLIENT)
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
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
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
}
