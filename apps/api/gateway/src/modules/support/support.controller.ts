import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { orgHasAddOn, slaBusinessMinutes } from '@hbcfield/shared';
import { Public } from '../../common/decorators';
import { SupportService } from './support.service';
import { CreateTicketDto, AddMessageDto, SetStatusDto, AssignDto } from './dto';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly config: ConfigService,
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

  @Public()
  @Get('agent/inbox')
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
    return this.support.inbox({ status, tier, atRisk: atRisk === 'true', page, limit });
  }

  @Public()
  @Get('agent/tickets/:id')
  @ApiOperation({ summary: 'Agent: full thread incl. internal notes (secret-gated)' })
  agentThread(@Param('id') id: string, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.thread({ ticketId: id, asAgent: true });
  }

  @Public()
  @Post('agent/tickets/:id/messages')
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
    });
  }

  @Public()
  @Post('agent/tickets/:id/assign')
  @ApiOperation({ summary: 'Agent: assign a ticket (secret-gated)' })
  agentAssign(@Param('id') id: string, @Body() dto: AssignDto, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.assign({ ticketId: id, agentId: dto.agentId ?? this.agentHandle(req) });
  }

  @Public()
  @Post('agent/tickets/:id/status')
  @ApiOperation({ summary: 'Agent: set ticket status (secret-gated)' })
  agentStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.setStatus({ ticketId: id, status: dto.status });
  }

  @Public()
  @Post('agent/tickets/:id/read')
  @ApiOperation({ summary: 'Agent: mark ticket read (secret-gated)' })
  agentRead(@Param('id') id: string, @Req() req: any) {
    this.assertPlatformKey(req);
    return this.support.markRead({ ticketId: id, reader: 'AGENT' });
  }

  // ── operator gate (mirrors billing.controller) ──
  private assertPlatformKey(req: any): void {
    const expected = this.config.get<string>('PLATFORM_ADMIN_KEY');
    const provided = (req.headers['x-platform-admin-key'] as string) || '';
    if (!expected || provided !== expected) {
      throw new HttpException({ message: 'Forbidden' }, HttpStatus.FORBIDDEN);
    }
  }

  private agentHandle(req: any): string {
    return (req.headers['x-support-agent'] as string)?.slice(0, 80) || 'operator';
  }
}
