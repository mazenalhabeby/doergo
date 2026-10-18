import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { orgHasAddOn, slaBusinessMinutes } from '@hbcfield/shared';
import { SupportService } from './support.service';
import { CreateTicketDto, AddMessageDto } from './dto';
import type { SupportAttachmentMessage } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/*
  ⚠️ Contract mismatches, kept as they are (the handler declares narrower types than arrive):
  the DTO lets an attachment's `fileSize` be absent, and `page`/`limit` travel as the query's strings.
*/
const wireAttachments = (a: CreateTicketDto['attachments']) => a as SupportAttachmentMessage[] | undefined;
const wireNumber = (v: string) => v as unknown as number;

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
  ) {}

  // ════════════════════ CUSTOMER (JWT) ════════════════════

  @Get('config')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Support entitlements for the current org (SLA, live chat)' })
  getConfig(@Req() req: AuthedRequest) {
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
  createTicket(@Body() dto: CreateTicketDto, @Req() req: AuthedRequest) {
    return this.support.createTicket({
      id: dto.id,
      organizationId: callerOrgId(req.user),
      createdById: req.user.id,
      orgAddOns: req.user.orgAddOns ?? [],
      subject: dto.subject,
      body: dto.body,
      category: dto.category,
      channel: dto.channel ?? 'WEB',
      attachments: wireAttachments(dto.attachments),
    });
  }

  @Get('tickets')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'List my support tickets' })
  listMine(
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: AuthedRequest,
  ) {
    return this.support.list({ createdById: req.user.id, status, page: wireNumber(page), limit: wireNumber(limit) });
  }

  @Get('tickets/:id')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get one of my tickets (thread)' })
  getMine(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.support.thread({
      ticketId: id,
      organizationId: callerOrgId(req.user),
      userId: req.user.id,
      asAgent: false,
    });
  }

  @Post('tickets/:id/messages')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Reply to my ticket' })
  reply(@Param('id') id: string, @Body() dto: AddMessageDto, @Req() req: AuthedRequest) {
    return this.support.addMessage({
      id: dto.id,
      ticketId: id,
      authorId: req.user.id,
      authorType: 'CUSTOMER',
      body: dto.body,
      attachments: wireAttachments(dto.attachments),
      organizationId: callerOrgId(req.user),
      userId: req.user.id,
    });
  }

  @Post('tickets/:id/read')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Mark my ticket read' })
  readMine(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.support.markRead({ ticketId: id, reader: 'CUSTOMER', userId: req.user.id });
  }

  // The AGENT side lives in the operator console only (admin.hbcfield.com,
  // platform-admin/platform-support.controller.ts): staff login, 2FA, team
  // scope. The static-key `/support/agent/*` routes and the web app's
  // /operator/support page that used them were removed — the platform key no
  // longer opens any support thread.
}
