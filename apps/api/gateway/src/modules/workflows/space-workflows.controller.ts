import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { WorkflowsService } from './workflows.service';

/**
 * /workflows/spaces/:spaceId — the workflows a workspace runs: attaching,
 * detaching, its own copy, its default.
 */
@ApiTags('workflows')
@ApiBearerAuth()
@RequirePlan('workflows')
@Controller('workflows')
export class SpaceWorkflowsController {


  constructor(
    private readonly workflowsService: WorkflowsService,
  ) {}


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
