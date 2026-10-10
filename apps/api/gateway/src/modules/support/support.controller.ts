import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { PlatformAuditInterceptor, staticKeyAgent } from '../../common/interceptors/platform-audit.interceptor';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { orgHasAddOn, slaBusinessMinutes, type SupportAgentScope } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { SupportService } from './support.service';
import { CreateTicketDto, AddMessageDto, SetStatusDto, AssignDto } from './dto';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly config: ConfigService,
    private readonly platformAdminGuard: PlatformAdminGuard,
  ) {}

  // ════════════════════ CUSTOMER (JWT) ════════════════════

  @Get('config')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Support entitlements for the current org (SLA, live chat)' })
  getConfig(@Req() req: any) {
    // Support promises follow what the organization BOUGHT, not a rank.
    const addOns = (req.user.orgAddOns ?? []) as string[];
    return {
      data: {
        // `tier` used to be here for the client to render "Business plan".
        // There is no plan to name any more — the client shows what was bought.
        addOns,
        slaBusinessMinutes: slaBusinessMinutes(addOns),
        liveChat: orgHasAddOn(addOns, 'live_chat'),
        priorityRouting: orgHasAddOn(addOns, 'priority_routing'),
        dedicatedSupport: orgHasAddOn(addOns, 'dedicated_support'),
      },
    };
  }

  @Post('tickets')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Open a support ticket' })
  createTicket(@Body() dto: CreateTicketDto, @Req() req: any) {
    return this.support.createTicket({
      id: dto.id,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
      orgAddOns: req.user.orgAddOns ?? [],
      subject: dto.subject,
      body: dto.body,
      category: dto.category,
      channel: dto.channel ?? 'WEB',
      attachments: dto.attachments,
    });
  }

  @Get('tickets')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'List my support tickets' })
  listMine(@Query('status') status: string, @Query('page') page: string, @Query('limit') limit: string, @Req() req: any) {
    return this.support.list({ createdById: req.user.id, status, page, limit });
  }

  @Get('tickets/:id')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get one of my tickets (thread)' })
  getMine(@Param('id') id: string, @Req() req: any) {
    return this.support.thread({ ticketId: id, organizationId: req.user.organizationId, userId: req.user.id, asAgent: false });
  }

  @Post('tickets/:id/messages')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Reply to my ticket' })
  reply(@Param('id') id: string, @Body() dto: AddMessageDto, @Req() req: any) {
    return this.support.addMessage({
      id: dto.id,
      ticketId: id,
      authorId: req.user.id,
      authorType: 'CUSTOMER',
      body: dto.body,
      attachments: dto.attachments,
      organizationId: req.user.organizationId,
      userId: req.user.id,
    });
  }

  @Post('tickets/:id/read')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Mark my ticket read' })
  readMine(@Param('id') id: string, @Req() req: any) {
    return this.support.markRead({ ticketId: id, reader: 'CUSTOMER', userId: req.user.id });
  }

  // ════════════════════ AGENT (platform-key gated, no JWT) ════════════════════
  // Agents are operator staff — same fail-closed x-platform-admin-key gate as the
  // billing operator console. `x-support-agent` optionally attributes the reply.
  //
  // Kept for the web app's /operator/support page, which still signs in with the
  // static key (pending its move to the platform console's staff login). Every
  // call is rate-limited and recorded in the platform audit trail as
  // "static-key" + the agent name it declared. The key is the whole-platform
  // secret, so its scope is explicitly the supervisor's — stated, not implied by
  // a missing scope (which the task-service treats as the narrowest).
  private static readonly STATIC_KEY_SCOPE: SupportAgentScope = { isSupervisor: true, teamIds: [], platformUserId: null };

  @Public()
  @Get('agent/inbox')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: prioritized ticket inbox (secret-gated)' })
  inbox(
    @Query('status') status: string,
    @Query('tier') tier: string,
    @Query('atRisk') atRisk: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    this.assertPlatformKey(req);
    const scope = SupportController.STATIC_KEY_SCOPE;
    return this.support.inbox({ status, tier, atRisk: atRisk === 'true', page, limit, isSupervisor: scope.isSupervisor, teamIds: scope.teamIds });
  }

  @Public()
  @Get('agent/tickets/:id')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: full thread incl. internal notes (secret-gated)' })
  agentThread(@Param('id') id: string, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.thread({ ticketId: id, asAgent: true, scope: SupportController.STATIC_KEY_SCOPE });
  }

  @Public()
  @Post('agent/tickets/:id/messages')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: reply or add internal note (secret-gated)' })
  agentReply(@Param('id') id: string, @Body() dto: AddMessageDto, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.addMessage({
      ticketId: id,
      authorId: this.agentHandle(req),
      authorType: 'AGENT',
      body: dto.body,
      attachments: dto.attachments,
      isInternalNote: dto.isInternalNote,
      asAgent: true,
      scope: SupportController.STATIC_KEY_SCOPE,
    });
  }

  @Public()
  @Post('agent/tickets/:id/assign')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: assign a ticket (secret-gated)' })
  agentAssign(@Param('id') id: string, @Body() dto: AssignDto, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.assign({ ticketId: id, agentId: dto.agentId ?? this.agentHandle(req), scope: SupportController.STATIC_KEY_SCOPE });
  }

  @Public()
  @Post('agent/tickets/:id/status')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: set ticket status (secret-gated)' })
  agentStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.setStatus({ ticketId: id, status: dto.status, scope: SupportController.STATIC_KEY_SCOPE });
  }

  @Public()
  @Post('agent/tickets/:id/read')
  @UseInterceptors(PlatformAuditInterceptor)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Agent: mark ticket read (secret-gated)' })
  agentRead(@Param('id') id: string, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.markRead({ ticketId: id, reader: 'AGENT', scope: SupportController.STATIC_KEY_SCOPE });
  }

  // ── operator gate (mirrors billing.controller) ──
  /**
   * The operator secret check, delegated to `PlatformAdminGuard` (audit B-B1).
   * This was the THIRD implementation of one comparison — and, like the billing
   * copy, it used `!==`: non-constant-time, on the secret that opens every support
   * thread including internal notes. The guard hashes both sides to a fixed 32
   * bytes and uses `timingSafeEqual`. Both still fail closed when the key is unset.
   */
  private assertPlatformKey(req: any): void {
    this.platformAdminGuard.assertKey(req);
  }

  private agentHandle(req: any): string {
    return staticKeyAgent(req) || 'operator';
  }
}
