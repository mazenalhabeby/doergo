import { assertServiceOk, type SupportAgentScope } from '@hbcfield/shared';
import { Body, Controller, Get, Param, Post, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformAuditInterceptor } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformSupportService } from './platform-support.service';

/**
 * The caller's support scope, resolved from the VERIFIED platform session
 * (never the request): supervisors see every ticket, everyone else their teams,
 * triage and what is assigned to them. Sent with EVERY ticket operation — the
 * task-service answers 404 for a ticket outside it.
 */
export function supportScopeOf(req: any): SupportAgentScope {
  const u = req?.platformUser ?? {};
  return {
    isSupervisor: u.isSupportSupervisor === true,
    teamIds: Array.isArray(u.supportTeamIds) ? u.supportTeamIds : [],
    platformUserId: typeof u.id === 'string' ? u.id : null,
  };
}

/**
 * Platform-staff support console (agent side) — tickets + live chat. Gated by
 * the platform login + `manageSupport` (Owner/Controller/Support). Replies and
 * claims are attributed to the operator's platform user ID (the name is
 * rendered at read time). Reuses the task-service support engine (DRY).
 */
@Controller('platform/support')
@Public()
@UseGuards(PlatformAuthGuard)
@UseInterceptors(PlatformAuditInterceptor)
@RequirePlatformPerm('manageSupport')
export class PlatformSupportController {
  constructor(private readonly svc: PlatformSupportService) {}
  private unwrap<T>(r: any): T {
    return assertServiceOk(r) as T;
  }

  @Get('inbox')
  async inbox(@Request() req: any, @Query('status') status?: string, @Query('tier') tier?: string, @Query('atRisk') atRisk?: string, @Query('view') view?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const scope = supportScopeOf(req);
    return this.unwrap(await this.svc.inbox({
      status, tier, atRisk: atRisk === 'true', view,
      page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50,
      isSupervisor: scope.isSupervisor,
      teamIds: scope.teamIds,
      agentId: scope.platformUserId,
    }));
  }

  @Get('tickets/:id')
  async thread(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.thread(id, supportScopeOf(req))); }

  @Post('tickets/:id/messages')
  async reply(@Param('id') id: string, @Body() body: { body?: string; attachments?: any[]; isInternalNote?: boolean }, @Request() req: any) {
    const scope = supportScopeOf(req);
    return this.unwrap(await this.svc.reply({
      ticketId: id, authorId: scope.platformUserId, authorType: 'AGENT', body: body?.body, attachments: body?.attachments,
      isInternalNote: !!body?.isInternalNote, asAgent: true, scope,
    }));
  }

  @Post('tickets/:id/status')
  async status(@Param('id') id: string, @Body() body: { status?: string }, @Request() req: any) {
    return this.unwrap(await this.svc.setStatus({ ticketId: id, status: body?.status, scope: supportScopeOf(req) }));
  }

  @Post('tickets/:id/assign')
  async assign(@Param('id') id: string, @Body() body: { agentId?: string | null; teamId?: string | null }, @Request() req: any) {
    const scope = supportScopeOf(req);
    // Build a sparse patch: only keys present are changed. With neither field the
    // acting agent self-claims the ticket.
    const payload: { ticketId: string; agentId?: string | null; teamId?: string | null; scope: SupportAgentScope } = { ticketId: id, scope };
    if (body && 'teamId' in body) payload.teamId = body.teamId ?? null;
    if (body && 'agentId' in body) payload.agentId = body.agentId ?? null;
    else if (!(body && 'teamId' in body)) payload.agentId = scope.platformUserId; // self-claim
    return this.unwrap(await this.svc.assign(payload));
  }

  @Post('tickets/:id/read')
  async read(@Param('id') id: string, @Request() req: any) { return this.unwrap(await this.svc.markRead(id, supportScopeOf(req))); }
}
