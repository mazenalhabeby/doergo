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
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, UpdateStatusDto } from './dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() createTaskDto: CreateTaskDto) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'create_task' }, createTaskDto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() query: Record<string, any>) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'find_all_tasks' }, query),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a task by ID' })
  async findOne(@Param('id') id: string) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'find_task' }, { id }),
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'update_task' }, { id, ...updateTaskDto }),
    );
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign a task to a worker' })
  async assign(@Param('id') id: string, @Body() assignTaskDto: AssignTaskDto) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'assign_task' }, { id, ...assignTaskDto }),
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update task status' })
  async updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateStatusDto) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'update_task_status' }, { id, ...updateStatusDto }),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'delete_task' }, { id }),
    );
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_task_timeline' }, { id }),
    );
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: { content: string }) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'add_comment' }, { taskId: id, ...body }),
    );
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'get_comments' }, { taskId: id }),
    );
  }
}
