import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { accessAllows, isAdmin, isApprovalKind, isRuleKind, ownAccess } from '@hbcfield/shared';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DecideApprovalDto } from './dto/decide.dto';
import { DecideDayDto } from './dto/decide-day.dto';
import { ApprovalDaysService } from './approval-days.service';
import { ApprovalsService } from './approvals.service';
import { ApprovalRouteService } from './approval-route.service';
import { StandInsService } from './stand-ins.service';
import { CreateStandInDto } from './dto/stand-in.dto';
import { ApprovalRuleDto } from './dto/approval-rule.dto';
import { ApprovalRulesClient } from './approval-rules.client';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';
/**
 * Everything waiting for the caller to decide, in one place — see
 * packages/shared/src/approvals. Any signed-in member may ask: what they get is
 * exactly what the thirteen existing lists give them, and a decision is
 * exactly the existing action, both run as them.
 */
@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly routes: ApprovalRouteService,
    private readonly standIns: StandInsService,
    private readonly rules: ApprovalRulesClient,
    private readonly days: ApprovalDaysService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Everything waiting for the caller to decide, ordered by what cannot wait' })
  async list(@Request() req: AuthedRequest) {
    return { success: true, data: await this.approvals.list(caller(req)) };
  }

  @Get('count')
  @ApiOperation({ summary: 'How many decisions wait for the caller (cached ~20 s)' })
  async count(@Request() req: AuthedRequest) {
    return { success: true, data: await this.approvals.count(caller(req)) };
  }

  @Get('route')
  @ApiOperation({ summary: 'Who else can decide one item of your inbox, and who is told about the person' })
  async route(@Query('kind') kind: string, @Query('id') id: string, @Request() req: AuthedRequest) {
    if (!isApprovalKind(kind) || typeof id !== 'string' || !id || id.length > 128)
      throw new BadRequestException('kind and id are required');
    return { success: true, data: await this.routes.route(caller(req), kind, id) };
  }

  @Get('stand-ins')
  @ApiOperation({
    summary: 'Stand-ins: mine (I am away), for me (I cover), and — for people managers — everybody else',
  })
  async listStandIns(@Request() req: AuthedRequest) {
    return { success: true, data: await this.standIns.list(req.user) };
  }

  @Post('stand-ins')
  @ApiOperation({
    summary: "Hand approval decisions to a stand-in for whole days (yours, or anybody's if you manage people)",
  })
  async createStandIn(@Body() dto: CreateStandInDto, @Request() req: AuthedRequest) {
    return { success: true, data: await this.standIns.create(req.user, dto) };
  }

  @Post('stand-ins/:id/end')
  @HttpCode(200)
  @ApiOperation({ summary: 'End a stand-in now (the leader, the stand-in, or a people manager)' })
  async endStandIn(@Param('id') id: string, @Request() req: AuthedRequest) {
    if (!id || id.length > 128) throw new BadRequestException('id is required');
    return { success: true, data: await this.standIns.end(req.user, id) };
  }

  @Get('rules')
  @ApiOperation({ summary: "The office's approval rules (thresholds → a second approval)" })
  async listRules(@Request() req: AuthedRequest) {
    assertManagesPeople(req.user);
    return { success: true, data: await this.rules.list(callerOrgId(req.user)) };
  }

  @Get('rules/insights')
  @ApiOperation({ summary: 'What the rules of one kind did over the last 90 days, and the rules worth adding' })
  async ruleInsights(@Query('kind') kind: string, @Request() req: AuthedRequest) {
    assertManagesPeople(req.user);
    if (!isRuleKind(kind)) throw new BadRequestException('kind is overtime, request or expense');
    return { success: true, data: await this.rules.insights(callerOrgId(req.user), kind) };
  }

  @Post('rules')
  @ApiOperation({ summary: 'Add an approval rule' })
  async createRule(@Body() dto: ApprovalRuleDto, @Request() req: AuthedRequest) {
    assertManagesPeople(req.user);
    return { success: true, data: await this.rules.save(callerOrgId(req.user), req.user.id, dto) };
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Change an approval rule' })
  async updateRule(@Param('id') id: string, @Body() dto: ApprovalRuleDto, @Request() req: AuthedRequest) {
    assertManagesPeople(req.user);
    return { success: true, data: await this.rules.save(callerOrgId(req.user), req.user.id, dto, id) };
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Remove an approval rule' })
  async deleteRule(@Param('id') id: string, @Request() req: AuthedRequest) {
    assertManagesPeople(req.user);
    return { success: true, data: await this.rules.remove(callerOrgId(req.user), id) };
  }

  @Post('decide')
  @HttpCode(200)
  @ApiOperation({ summary: "Decide one item through its kind's existing route" })
  async decide(@Body() dto: DecideApprovalDto, @Request() req: AuthedRequest) {
    const r = await this.approvals.decide(caller(req), dto);
    if (!r.ok)
      throw new HttpException(
        { statusCode: r.status, message: r.message ?? r.code, code: r.code, params: r.params },
        r.status,
      );
    return {
      success: true,
      data: { decided: true, ...('stage' in r && r.stage ? { stage: r.stage, waitingFor: r.waitingFor } : {}) },
    };
  }

  @Post('decide-day')
  @HttpCode(200)
  @ApiOperation({ summary: "Approve a person's working day — each item through its own route, as the caller" })
  async decideDay(@Body() dto: DecideDayDto, @Request() req: AuthedRequest) {
    return { success: true, data: await this.days.approveDay(caller(req), dto.members) };
  }
}

function caller(req: AuthedRequest) {
  return { user: req.user, headers: req.headers, ip: req.ip };
}

/**
 * Office rules decide who may finish a decision, so they are the organization's
 * own policy: an administrator, or `canManageUsers` held org-wide on their OWN
 * access (never through a stand-in). An external member never holds it org-wide.
 */
function assertManagesPeople(user: SessionUser) {
  if (isAdmin(user) || accessAllows(ownAccess(user?.access), 'canManageUsers')) return;
  throw new ForbiddenException('Only somebody who manages people can set approval rules');
}
