import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { CrmService } from './crm.service';
import { CrmQueueService } from './crm.queue.service';
import {
  CreatePipelineDto, UpdatePipelineDto, CreateStageDto, UpdateStageDto, ReorderStagesDto,
  CreateContactDto, UpdateContactDto,
  CreateLeadDto, UpdateLeadDto, ConvertLeadDto,
  CreateDealDto, UpdateDealDto, MoveDealDto,
  CreateActivityDto, UpdateActivityDto,
  CreateQuoteDto, UpdateQuoteDto, QuoteStatusDto,
  CreateCommissionRuleDto, UpdateCommissionRuleDto, CommissionEntryStatusDto,
} from './dto';

@ApiTags('crm')
@ApiBearerAuth()
@RequirePlan('crm')
@Controller('crm')
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly q: CrmQueueService,
  ) {}

  /** org from token. */
  private org(req: any) { return req.user.organizationId; }
  /**
   * Reps see only their own records; managers/admins see the whole org. Returns
   * the ownerId to scope by, or undefined for full visibility. Fail-closed: an
   * explicit ownerId query is only honored for privileged viewers.
   */
  private scope(req: any, explicit?: string): string | undefined {
    const privileged = !!(req.user.canViewAllTasks || req.user.canManageUsers);
    if (privileged) return explicit || undefined;
    return req.user.id;
  }

  // ── Pipelines & stages ───────────────────────────────────────────────────
  @Get('pipelines')
  @ApiOperation({ summary: 'List pipelines with stages' })
  listPipelines(@Request() req: any) {
    return this.crm.listPipelines({ organizationId: this.org(req) });
  }

  @Post('pipelines')
  createPipeline(@Body() dto: CreatePipelineDto, @Request() req: any) {
    return this.q.createPipeline({ ...dto, organizationId: this.org(req), userId: req.user.id });
  }

  @Patch('pipelines/:id')
  updatePipeline(@Param('id') id: string, @Body() dto: UpdatePipelineDto, @Request() req: any) {
    return this.q.updatePipeline({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('pipelines/:id')
  deletePipeline(@Param('id') id: string, @Request() req: any) {
    return this.q.deletePipeline({ id, organizationId: this.org(req) });
  }

  @Post('pipelines/:id/stages')
  createStage(@Param('id') pipelineId: string, @Body() dto: CreateStageDto, @Request() req: any) {
    return this.q.createStage({ ...dto, pipelineId, organizationId: this.org(req) });
  }

  @Post('pipelines/:id/stages/reorder')
  reorderStages(@Param('id') pipelineId: string, @Body() dto: ReorderStagesDto, @Request() req: any) {
    return this.q.reorderStages({ ...dto, pipelineId, organizationId: this.org(req) });
  }

  @Patch('stages/:id')
  updateStage(@Param('id') id: string, @Body() dto: UpdateStageDto, @Request() req: any) {
    return this.q.updateStage({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('stages/:id')
  deleteStage(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteStage({ id, organizationId: this.org(req) });
  }

  // ── Deals ─────────────────────────────────────────────────────────────────
  @Get('board')
  @ApiOperation({ summary: 'Kanban board — open deals grouped by stage' })
  getBoard(@Query('pipelineId') pipelineId: string | undefined, @Request() req: any) {
    return this.crm.getBoard({ organizationId: this.org(req), pipelineId, ownerId: this.scope(req) });
  }

  @Get('forecast')
  getForecast(@Query('pipelineId') pipelineId: string | undefined, @Request() req: any) {
    return this.crm.getForecast({ organizationId: this.org(req), pipelineId });
  }

  @Get('deals')
  listDeals(@Query() query: any, @Request() req: any) {
    return this.crm.listDeals({
      organizationId: this.org(req),
      pipelineId: query.pipelineId,
      stageId: query.stageId,
      ownerId: this.scope(req, query.ownerId),
      open: query.open === 'true',
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('deals/:id')
  getDeal(@Param('id') id: string, @Request() req: any) {
    return this.crm.getDeal({ id, organizationId: this.org(req) });
  }

  @Post('deals')
  createDeal(@Body() dto: CreateDealDto, @Request() req: any) {
    return this.q.createDeal({ ...dto, ownerId: dto.ownerId ?? req.user.id, organizationId: this.org(req) });
  }

  @Patch('deals/:id')
  updateDeal(@Param('id') id: string, @Body() dto: UpdateDealDto, @Request() req: any) {
    return this.q.updateDeal({ ...dto, id, organizationId: this.org(req) });
  }

  @Post('deals/:id/move')
  moveDeal(@Param('id') id: string, @Body() dto: MoveDealDto, @Request() req: any) {
    return this.q.moveDealStage({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('deals/:id')
  deleteDeal(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteDeal({ id, organizationId: this.org(req) });
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

  // ── Leads ────────────────────────────────────────────────────────────────────
  @Get('leads')
  listLeads(@Query() query: any, @Request() req: any) {
    return this.crm.listLeads({
      organizationId: this.org(req),
      status: query.status,
      ownerId: this.scope(req, query.ownerId),
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('leads/:id')
  getLead(@Param('id') id: string, @Request() req: any) {
    return this.crm.getLead({ id, organizationId: this.org(req) });
  }

  @Post('leads')
  createLead(@Body() dto: CreateLeadDto, @Request() req: any) {
    return this.q.createLead({ ...dto, ownerId: dto.ownerId ?? req.user.id, organizationId: this.org(req) });
  }

  @Patch('leads/:id')
  updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto, @Request() req: any) {
    return this.q.updateLead({ ...dto, id, organizationId: this.org(req) });
  }

  @Post('leads/:id/convert')
  convertLead(@Param('id') id: string, @Body() dto: ConvertLeadDto, @Request() req: any) {
    return this.q.convertLead({ ...dto, id, organizationId: this.org(req), userId: req.user.id });
  }

  @Delete('leads/:id')
  deleteLead(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteLead({ id, organizationId: this.org(req) });
  }

  // ── Activities ──────────────────────────────────────────────────────────────
  @Get('activities')
  listActivities(@Query() query: any, @Request() req: any) {
    return this.crm.listActivities({
      organizationId: this.org(req),
      dealId: query.dealId,
      leadId: query.leadId,
      contactId: query.contactId,
      ownerId: this.scope(req, query.ownerId),
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('activities')
  createActivity(@Body() dto: CreateActivityDto, @Request() req: any) {
    return this.q.createActivity({ ...dto, ownerId: dto.ownerId ?? req.user.id, organizationId: this.org(req) });
  }

  @Patch('activities/:id')
  updateActivity(@Param('id') id: string, @Body() dto: UpdateActivityDto, @Request() req: any) {
    return this.q.updateActivity({ ...dto, id, organizationId: this.org(req) });
  }

  @Delete('activities/:id')
  deleteActivity(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteActivity({ id, organizationId: this.org(req) });
  }

  // ── Quotes ──────────────────────────────────────────────────────────────────
  @Get('quotes')
  listQuotes(@Query() query: any, @Request() req: any) {
    return this.crm.listQuotes({ organizationId: this.org(req), dealId: query.dealId, status: query.status, page: query.page, limit: query.limit });
  }

  @Get('quotes/:id')
  getQuote(@Param('id') id: string, @Request() req: any) {
    return this.crm.getQuote({ id, organizationId: this.org(req) });
  }

  @Post('quotes')
  createQuote(@Body() dto: CreateQuoteDto, @Request() req: any) {
    return this.q.createQuote({ ...dto, organizationId: this.org(req), userId: req.user.id });
  }

  @Patch('quotes/:id')
  updateQuote(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @Request() req: any) {
    return this.q.updateQuote({ ...dto, id, organizationId: this.org(req) });
  }

  @Post('quotes/:id/status')
  setQuoteStatus(@Param('id') id: string, @Body() dto: QuoteStatusDto, @Request() req: any) {
    return this.q.setQuoteStatus({ ...dto, id, organizationId: this.org(req) });
  }

  @Post('quotes/:id/convert-invoice')
  convertQuote(@Param('id') id: string, @Request() req: any) {
    return this.q.convertQuoteToInvoice({ id, organizationId: this.org(req), userId: req.user.id });
  }

  @Delete('quotes/:id')
  deleteQuote(@Param('id') id: string, @Request() req: any) {
    return this.q.deleteQuote({ id, organizationId: this.org(req) });
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
