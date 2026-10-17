import { Controller, Get, Post, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { taskActor, taskRequester, assignSpaceIds } from '../../common/task-actor';
import { AddAssigneeDto, AddCommentDto } from './dto';
import { TasksControllerBase } from './tasks-controller.base';

import type { AuthedRequest } from '../../common/request.types';
/** /tasks/:id — a job's history, comments, step answers and assignees. */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskActivityController extends TasksControllerBase {
  @Get(':id/submissions')
  @ApiOperation({ summary: "The job's step-form submissions (its reports), with signed file links" })
  async getSubmissions(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.tasksService.getSubmissions({
      id,
      ...taskActor(req, { crossOrgRead: true }),
    });
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get task timeline/activity' })
  async getTimeline(@Param('id') id: string, @Request() req: AuthedRequest) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getTimeline({
      id,
      ...taskActor(req),
    });
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to a task' })
  async addComment(@Param('id') id: string, @Body() body: AddCommentDto, @Request() req: AuthedRequest) {
    await this.assertExternalMayWrite(req, id);
    return this.tasksQueueService.addComment({
      taskId: id,
      ...body,
      ...taskActor(req),
    });
  }

  @Get(':id/comments')
  @ApiOperation({ summary: 'Get task comments' })
  async getComments(@Param('id') id: string, @Request() req: AuthedRequest) {
    // READ operation - use direct microservice call (faster, no queue overhead)
    return this.tasksService.getComments({
      taskId: id,
      ...taskActor(req),
    });
  }

  // ============ Assignee Endpoints ============

  @Post(':id/assignees')
  /*
    Space-aware: the org-wide column refused a supervisor the right to add a
    second person to a job at their OWN site, while that job sat on their task
    list. The guard widens; `assertMayAssign` in the service decides, against
    the task's real space — never a client-supplied one.
  */
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Add an assignee to a task' })
  async addAssignee(@Param('id') id: string, @Body() addAssigneeDto: AddAssigneeDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.addAssignee({
      taskId: id,
      ...addAssigneeDto,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: assignSpaceIds(req),
      ...taskRequester(req),
    });
  }

  @Delete(':id/assignees/:userId')
  @RequirePermissionInSpace('canAssignTasks')
  @ApiOperation({ summary: 'Remove an assignee from a task' })
  async removeAssignee(@Param('id') id: string, @Param('userId') userId: string, @Request() req: AuthedRequest) {
    return this.tasksQueueService.removeAssignee({
      taskId: id,
      userId,
      // Where this caller may ASSIGN, resolved from their role grants. The
      // guard above accepts a grant held in any space; the service then checks
      // it against the task's own space, which is the real decision.
      assignSpaceIds: assignSpaceIds(req),
      ...taskRequester(req),
    });
  }
}
