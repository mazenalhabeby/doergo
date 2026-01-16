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
  Inject,
  Request,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, UpdateStatusDto } from './dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}

  @Post()
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create a new task (CLIENT only)' })
  async create(@Body() createTaskDto: CreateTaskDto, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'create_task' }, {
        ...createTaskDto,
        userId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get()
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get all tasks (filtered by role)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'find_all_tasks' }, {
        ...query,
        userId: req.user.id,
        userRole: req.user.role,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'find_task' }, {
        id,
        userId: req.user.id,
        userRole: req.user.role,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Put(':id')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Update a task (CLIENT only - own tasks)' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'update_task' }, {
        id,
        ...updateTaskDto,
        userId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Patch(':id/assign')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Assign a task to a technician (DISPATCHER only)' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'assign_task' }, {
        id,
        ...assignTaskDto,
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Patch(':id/status')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Update task status (TECHNICIAN only - assigned tasks)' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'update_task_status' }, {
        id,
        ...updateStatusDto,
        technicianId: req.user.id,
      }),
    );
  }

  @Delete(':id')
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Delete a task (CLIENT only - own tasks)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'delete_task' }, {
        id,
        userId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get(':id/timeline')
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_task_timeline' }, {
        id,
        userId: req.user.id,
        userRole: req.user.role,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Post(':id/comments')
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: { content: string }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'add_comment' }, {
        taskId: id,
        ...body,
        userId: req.user.id,
        userRole: req.user.role,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get(':id/comments')
  @Roles(Role.CLIENT, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_comments' }, {
        taskId: id,
        userId: req.user.id,
        userRole: req.user.role,
        organizationId: req.user.organizationId,
      }),
    );
  }
}
