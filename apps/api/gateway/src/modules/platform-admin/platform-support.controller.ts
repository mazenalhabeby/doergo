import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PlatformAuthGuard, RequirePlatformPerm } from '../../common/guards/platform-auth.guard';
import { PlatformSupportService } from './platform-support.service';

/**
 * Platform-staff support console (agent side) — tickets + live chat. Gated by
 * the platform login + `manageSupport` (Owner/Controller/Support). Replies are
 * attributed to the acting staff member. Reuses the same task-service support
 * engine as the customer side (DRY).
 */
@Controller('platform/support')
@Public()
@UseGuards(PlatformAuthGuard)
@RequirePlatformPerm('manageSupport')
export class PlatformSupportController {
  constructor(private readonly svc: PlatformSupportService) {}
  private unwrap<T>(r: any): T { if (r && r.success === false) throw new HttpException({ message: r.message ?? 'Error' }, r.statusCode ?? HttpStatus.BAD_REQUEST); return r; }
  private agent(req: any): string { const u = req.platformUser; return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || u?.email || 'agent'; }

  @Get('inbox')
  async inbox(@Query('status') status?: string, @Query('tier') tier?: string, @Query('atRisk') atRisk?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.unwrap(await this.svc.inbox({ status, tier, atRisk: atRisk === 'true', page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 }));
  }

  @Get('tickets/:id')
  async thread(@Param('id') id: string) { return this.unwrap(await this.svc.thread(id)); }

  @Post('tickets/:id/messages')
  async reply(@Param('id') id: string, @Body() body: { body?: string; attachments?: any[]; isInternalNote?: boolean }, @Request() req: any) {
    return this.unwrap(await this.svc.reply({ ticketId: id, authorId: this.agent(req), authorType: 'AGENT', body: body?.body, attachments: body?.attachments, isInternalNote: !!body?.isInternalNote, asAgent: true }));
  }

  @Post('tickets/:id/status')
  async status(@Param('id') id: string, @Body() body: { status?: string }) { return this.unwrap(await this.svc.setStatus({ ticketId: id, status: body?.status })); }

  @Post('tickets/:id/assign')
  async assign(@Param('id') id: string, @Body() body: { agentId?: string }, @Request() req: any) { return this.unwrap(await this.svc.assign({ ticketId: id, agentId: body?.agentId ?? this.agent(req) })); }

  @Post('tickets/:id/read')
  async read(@Param('id') id: string) { return this.unwrap(await this.svc.markRead(id)); }
}
