import { Controller, Get, Post, Put, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { taskActor } from '../../common/task-actor';
import { HandoverDto, ResumeWorkDto, CrewJoinDto, CrewLeaveDto, CrewIssueDto, ChangeLeadDto } from './dto';
import { TasksControllerBase } from './tasks-controller.base';

import type { AuthedRequest } from '../../common/request.types';
/**
 * /tasks/:id — the crew on a job: resume, hand-over notes, joining and leaving,
 * own issue, the lead, worked time.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskCrewController extends TasksControllerBase {
  /** "Resume work" on a job paused at a clock-out. The clock gate applies. */
  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume work on a job paused at a clock-out' })
  async resumeWork(@Param('id') id: string, @Body() body: ResumeWorkDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.resumeWork({
      id,
      ...body,
      ...taskActor(req),
    });
  }

  /** "What I did, and what is left" — by somebody on the job, or who owes the note. */
  @Post(':id/handover')
  @ApiOperation({ summary: 'Write the handover note for a job' })
  async addHandover(@Param('id') id: string, @Body() body: HandoverDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.addHandover({
      ...body,
      taskId: id,
      ...taskActor(req),
    });
  }

  // ─── A crew on one job (packages/shared/src/tasks/crew.ts) ───
  // No route permission: the caller's place on THIS job's crew is the
  // authorization, checked in task-service. External members hold no clock
  // and work no job of ours.

  @Post(':id/crew/join')
  @DenyExternal()
  @ApiOperation({ summary: 'Join a crew job (own tap, "I\'m with him", or the office for somebody)' })
  async crewJoin(@Param('id') id: string, @Body() body: CrewJoinDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.crewJoin({ ...body, taskId: id, ...taskActor(req) });
  }

  @Post(':id/crew/leave')
  @DenyExternal()
  @ApiOperation({ summary: 'Leave a crew job' })
  async crewLeave(@Param('id') id: string, @Body() body: CrewLeaveDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.crewLeave({ ...body, taskId: id, ...taskActor(req) });
  }

  @Post(':id/crew/issue')
  @DenyExternal()
  @ApiOperation({ summary: '"My issue": only the caller\'s own time is blocked' })
  async crewIssue(@Param('id') id: string, @Body() body: CrewIssueDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.crewSelfIssue({ ...body, taskId: id, ...taskActor(req) });
  }

  @Post(':id/crew/resume')
  @DenyExternal()
  @ApiOperation({ summary: 'Back to work after their own stop' })
  async crewResume(@Param('id') id: string, @Body() body: ResumeWorkDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.crewSelfResume({ ...body, taskId: id, ...taskActor(req) });
  }

  @Put(':id/lead')
  @DenyExternal()
  @ApiOperation({ summary: "Hand this job's lead to somebody on its crew — for today, or for good" })
  async changeLead(@Param('id') id: string, @Body() body: ChangeLeadDto, @Request() req: AuthedRequest) {
    return this.tasksQueueService.crewChangeLead({ ...body, taskId: id, ...taskActor(req) });
  }

  /**
   * The step forms answered on this job, oldest first — each with the form it
   * answered (the snapshot) and its photos / signatures as short-lived signed
   * links. Gated exactly like GET /tasks/:id (the same facts, the same check in
   * task-service). Read only when a report section is opened.
   */
  /** A job's time: travel, working, blocked — per worker, and who started it. */
  @Get(':id/time')
  @ApiOperation({ summary: "A job's time, split into travel, working and blocked" })
  async jobTime(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.tasksService.jobTime({
      id,
      ...taskActor(req, { crossOrgRead: true }),
    });
  }
}
