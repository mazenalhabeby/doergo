import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { CrmService } from './crm.service';
import { CrmQueueService } from './crm.queue.service';
import {
  CreateContactDto, UpdateContactDto,
  CreateCommissionRuleDto, UpdateCommissionRuleDto, CommissionEntryStatusDto,
} from './dto';

// Sales/CRM = the parts Tasks don't provide: contacts, commissions, and the
// sales-board read (deal-type tasks + forecast). Deals themselves are Tasks —
// created/moved via the tasks endpoints.
@ApiTags('crm')
@ApiBearerAuth()
@RequirePlan('crm')
@Controller('crm')
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly q: CrmQueueService,
  ) {}

  private org(req: any) { return req.user.organizationId; }
  /** Reps see only their own; managers/admins see the whole org (fail-closed). */
  private scope(req: any, explicit?: string): string | undefined {
    const privileged = !!(req.user.canViewAllTasks || req.user.canManageUsers);
    return privileged ? explicit || undefined : req.user.id;
  }

  // ── Sales board (deal-type tasks + forecast) ───────────────────────────────
  @Get('board')
  @ApiOperation({ summary: 'Pipeline board — deal-type tasks grouped by status' })
  getBoard(@Query('workflowId') workflowId: string | undefined, @Request() req: any) {
    return this.crm.getSalesBoard({ organizationId: this.org(req), workflowId, ownerId: this.scope(req) });
  }

  @Get('forecast')
  getForecast(@Query('workflowId') workflowId: string | undefined, @Request() req: any) {
    return this.crm.getForecast({ organizationId: this.org(req), workflowId });
  }

  // ── Contacts ────────────────────────────────────────────────────────────────
  @Get('contacts')
  listContacts(@Query() query: any, @Request() req: any) {
    return this.crm.listContacts({
      organizationId: this.org(req),
      spaceId: query.spaceId,
      ownerId: this.scope(req, query.ownerId),
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('contacts/:id')
  getContact(@Param('id') id: string, @Request() req: any) {
    return this.crm.getContact({ id, organizationId: this.org(req) });
  }

  @Post('contacts')
  createContact(@Body() dto: CreateContactDto, @Request() req: any) {
    return this.q.createContact({ ...dto, ownerId: dto.ownerId ?? req.user.id, organizationId: this.org(req) });
  }

  @Patch('contacts/:id')
  updateContact(@Param('id') id: string, @Body() dto: UpdateContactDto, @Request() req: any) {
    return this.q.updateContact({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('contacts/:id')
  deleteContact(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteContact({ id, organizationId: this.org(req) });
  }

  // ── Commissions ───────────────────────────────────────────────────────────────
  @Get('commission-rules')
  listCommissionRules(@Request() req: any) {
    return this.crm.listCommissionRules({ organizationId: this.org(req) });
  }

  @Post('commission-rules')
  createCommissionRule(@Body() dto: CreateCommissionRuleDto, @Request() req: any) {
    return this.q.createCommissionRule({ ...dto, organizationId: this.org(req) });
  }

  @Patch('commission-rules/:id')
  updateCommissionRule(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto, @Request() req: any) {
    return this.q.updateCommissionRule({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('commission-rules/:id')
  deleteCommissionRule(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteCommissionRule({ id, organizationId: this.org(req) });
  }

  @Get('commission-entries')
  listCommissionEntries(@Query() query: any, @Request() req: any) {
    return this.crm.listCommissionEntries({
      organizationId: this.org(req),
      ownerId: this.scope(req, query.ownerId),
      period: query.period,
      status: query.status,
    });
  }

  @Post('commission-entries/:id/status')
  setCommissionEntryStatus(@Param('id') id: string, @Body() dto: CommissionEntryStatusDto, @Request() req: any) {
    return this.q.setCommissionEntryStatus({ ...dto, id, organizationId: this.org(req) });
  }
}
