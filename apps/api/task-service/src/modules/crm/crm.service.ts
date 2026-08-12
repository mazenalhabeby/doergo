import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, SERVICE_NAMES } from '@hbcfield/shared';

// Default stages seeded when an org's first pipeline is created lazily.
const DEFAULT_STAGES = [
  { name: 'New', probability: 10, color: '#3b82f6' },
  { name: 'Qualified', probability: 30, color: '#8b5cf6' },
  { name: 'Proposal', probability: 60, color: '#f59e0b' },
  { name: 'Negotiation', probability: 80, color: '#f97316' },
  { name: 'Won', probability: 100, color: '#16a34a', isWon: true },
  { name: 'Lost', probability: 0, color: '#dc2626', isLost: true },
];

const PAGE = (p?: number) => Math.max(1, Number(p) || 1);
const LIMIT = (l?: number) => Math.min(100, Math.max(1, Number(l) || 20));
const clampPct = (n: any) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
const cents = (n: any) => Math.max(0, Math.round(Number(n) || 0));

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /** Fire-and-forget org socket refresh (deal moved, lead converted, …). */
  private emitChanged(organizationId: string, entity: string, action: string, id?: string) {
    try {
      this.notificationClient.emit('crm_changed', { organizationId, entity, action, id });
    } catch (err) {
      this.logger.warn(`crm_changed emit failed (${entity}.${action}): ${err}`);
    }
  }

  // ══════════════════════════════ PIPELINES ══════════════════════════════════

  /** Lazily ensure the org has a default pipeline (so the deals board works). */
  async ensureDefaultPipeline(organizationId: string): Promise<{ id: string; firstStageId: string }> {
    const existing = await this.prisma.pipeline.findFirst({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (existing) {
      const first = existing.stages[0];
      if (!first) {
        const seeded = await this.seedStages(organizationId, existing.id);
        return { id: existing.id, firstStageId: seeded[0]!.id };
      }
      return { id: existing.id, firstStageId: first.id };
    }
    const pipeline = await this.prisma.pipeline.create({
      data: { organizationId, name: 'Sales Pipeline', isDefault: true, position: 0 },
    });
    const stages = await this.seedStages(organizationId, pipeline.id);
    return { id: pipeline.id, firstStageId: stages[0]!.id };
  }

  private async seedStages(organizationId: string, pipelineId: string) {
    await this.prisma.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((s, i) => ({
        organizationId,
        pipelineId,
        name: s.name,
        position: i,
        probability: s.probability,
        color: s.color,
        isWon: !!s.isWon,
        isLost: !!s.isLost,
      })),
    });
    return this.prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: 'asc' } });
  }

  async listPipelines(data: { organizationId: string }) {
    let pipelines = await this.prisma.pipeline.findMany({
      where: { organizationId: data.organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (pipelines.length === 0) {
      await this.ensureDefaultPipeline(data.organizationId);
      pipelines = await this.prisma.pipeline.findMany({
        where: { organizationId: data.organizationId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    }
    return success(pipelines);
  }

  async createPipeline(data: { organizationId: string; name: string; isDefault?: boolean }) {
    const count = await this.prisma.pipeline.count({ where: { organizationId: data.organizationId } });
    const makeDefault = data.isDefault || count === 0;
    if (makeDefault) {
      await this.prisma.pipeline.updateMany({
        where: { organizationId: data.organizationId },
        data: { isDefault: false },
      });
    }
    const pipeline = await this.prisma.pipeline.create({
      data: { organizationId: data.organizationId, name: data.name, isDefault: makeDefault, position: count },
    });
    await this.seedStages(data.organizationId, pipeline.id);
    this.emitChanged(data.organizationId, 'pipeline', 'created', pipeline.id);
    return success(pipeline);
  }

  async updatePipeline(data: { organizationId: string; id: string; name?: string; isDefault?: boolean; isActive?: boolean }) {
    await this.mustOwn('pipeline', data.id, data.organizationId);
    if (data.isDefault) {
      await this.prisma.pipeline.updateMany({ where: { organizationId: data.organizationId }, data: { isDefault: false } });
    }
    const upd: any = {};
    if (data.name !== undefined) upd.name = data.name;
    if (data.isDefault !== undefined) upd.isDefault = data.isDefault;
    if (data.isActive !== undefined) upd.isActive = data.isActive;
    const pipeline = await this.prisma.pipeline.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'pipeline', 'updated', data.id);
    return success(pipeline);
  }

  async deletePipeline(data: { organizationId: string; id: string }) {
    await this.mustOwn('pipeline', data.id, data.organizationId);
    const deals = await this.prisma.deal.count({ where: { pipelineId: data.id } });
    if (deals > 0) {
      // Keep referential integrity — soft-deactivate instead of hard delete.
      await this.prisma.pipeline.update({ where: { id: data.id }, data: { isActive: false } });
    } else {
      await this.prisma.pipeline.delete({ where: { id: data.id } });
    }
    this.emitChanged(data.organizationId, 'pipeline', 'deleted', data.id);
    return success({ id: data.id });
  }

  async createStage(data: { organizationId: string; pipelineId: string; name: string; probability?: number; isWon?: boolean; isLost?: boolean; color?: string }) {
    await this.mustOwn('pipeline', data.pipelineId, data.organizationId);
    const last = await this.prisma.pipelineStage.findFirst({ where: { pipelineId: data.pipelineId }, orderBy: { position: 'desc' } });
    const stage = await this.prisma.pipelineStage.create({
      data: {
        organizationId: data.organizationId,
        pipelineId: data.pipelineId,
        name: data.name,
        position: (last?.position ?? -1) + 1,
        probability: clampPct(data.probability),
        isWon: !!data.isWon,
        isLost: !!data.isLost,
        color: data.color ?? '#6b7280',
      },
    });
    this.emitChanged(data.organizationId, 'stage', 'created', stage.id);
    return success(stage);
  }

  async updateStage(data: { organizationId: string; id: string; name?: string; probability?: number; isWon?: boolean; isLost?: boolean; color?: string }) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!stage) throw new NotFoundException('Stage not found');
    const upd: any = {};
    if (data.name !== undefined) upd.name = data.name;
    if (data.probability !== undefined) upd.probability = clampPct(data.probability);
    if (data.isWon !== undefined) upd.isWon = data.isWon;
    if (data.isLost !== undefined) upd.isLost = data.isLost;
    if (data.color !== undefined) upd.color = data.color;
    const updated = await this.prisma.pipelineStage.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'stage', 'updated', data.id);
    return success(updated);
  }

  async deleteStage(data: { organizationId: string; id: string }) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!stage) throw new NotFoundException('Stage not found');
    const deals = await this.prisma.deal.count({ where: { stageId: data.id } });
    if (deals > 0) throw new BadRequestException('Move or delete the deals in this stage first');
    const remaining = await this.prisma.pipelineStage.count({ where: { pipelineId: stage.pipelineId } });
    if (remaining <= 1) throw new BadRequestException('A pipeline needs at least one stage');
    await this.prisma.pipelineStage.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'stage', 'deleted', data.id);
    return success({ id: data.id });
  }

  async reorderStages(data: { organizationId: string; pipelineId: string; orderedIds: string[] }) {
    await this.mustOwn('pipeline', data.pipelineId, data.organizationId);
    await this.prisma.$transaction(
      data.orderedIds.map((id, i) =>
        this.prisma.pipelineStage.updateMany({
          where: { id, pipelineId: data.pipelineId, organizationId: data.organizationId },
          data: { position: i },
        }),
      ),
    );
    this.emitChanged(data.organizationId, 'stage', 'reordered', data.pipelineId);
    return success({ pipelineId: data.pipelineId });
  }

  // ══════════════════════════════ CONTACTS ═══════════════════════════════════

  async listContacts(data: { organizationId: string; spaceId?: string; ownerId?: string; search?: string; page?: number; limit?: number }) {
    const page = PAGE(data.page);
    const limit = LIMIT(data.limit);
    const where: any = { organizationId: data.organizationId };
    if (data.spaceId) where.spaceId = data.spaceId;
    if (data.ownerId) where.ownerId = data.ownerId;
    if (data.search) {
      where.OR = [
        { firstName: { contains: data.search, mode: 'insensitive' } },
        { lastName: { contains: data.search, mode: 'insensitive' } },
        { email: { contains: data.search, mode: 'insensitive' } },
        { phone: { contains: data.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.contact.count({ where }),
    ]);
    return paginated(rows, { page, limit, total });
  }

  async getContact(data: { organizationId: string; id: string }) {
    const contact = await this.prisma.contact.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!contact) throw new NotFoundException('Contact not found');
    const [deals, activities] = await Promise.all([
      this.prisma.deal.findMany({ where: { contactId: data.id, organizationId: data.organizationId }, orderBy: { updatedAt: 'desc' }, take: 50 }),
      this.prisma.salesActivity.findMany({ where: { contactId: data.id, organizationId: data.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return success({ ...contact, deals, activities });
  }

  async createContact(data: any) {
    const contact = await this.prisma.contact.create({
      data: {
        organizationId: data.organizationId,
        spaceId: data.spaceId ?? null,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        title: data.title ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        isPrimary: !!data.isPrimary,
        ownerId: data.ownerId ?? null,
        notes: data.notes ?? null,
      },
    });
    this.emitChanged(data.organizationId, 'contact', 'created', contact.id);
    return success(contact);
  }

  async updateContact(data: any) {
    await this.mustOwn('contact', data.id, data.organizationId);
    const upd: any = {};
    for (const k of ['spaceId', 'firstName', 'lastName', 'title', 'email', 'phone', 'isPrimary', 'ownerId', 'notes']) {
      if (data[k] !== undefined) upd[k] = data[k];
    }
    const contact = await this.prisma.contact.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'contact', 'updated', data.id);
    return success(contact);
  }

  async deleteContact(data: { organizationId: string; id: string }) {
    await this.mustOwn('contact', data.id, data.organizationId);
    await this.prisma.contact.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'contact', 'deleted', data.id);
    return success({ id: data.id });
  }

  // ══════════════════════════════ LEADS ══════════════════════════════════════

  async listLeads(data: { organizationId: string; status?: string; ownerId?: string; search?: string; page?: number; limit?: number }) {
    const page = PAGE(data.page);
    const limit = LIMIT(data.limit);
    const where: any = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') where.status = data.status;
    if (data.ownerId) where.ownerId = data.ownerId;
    if (data.search) {
      where.OR = [
        { name: { contains: data.search, mode: 'insensitive' } },
        { company: { contains: data.search, mode: 'insensitive' } },
        { email: { contains: data.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.lead.count({ where }),
    ]);
    return paginated(rows, { page, limit, total });
  }

  async getLead(data: { organizationId: string; id: string }) {
    const lead = await this.prisma.lead.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!lead) throw new NotFoundException('Lead not found');
    const activities = await this.prisma.salesActivity.findMany({ where: { leadId: data.id, organizationId: data.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return success({ ...lead, activities });
  }

  async createLead(data: any) {
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        company: data.company ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        source: data.source ?? null,
        status: data.status ?? 'NEW',
        ownerId: data.ownerId ?? null,
        notes: data.notes ?? null,
        address: data.address ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      },
    });
    this.emitChanged(data.organizationId, 'lead', 'created', lead.id);
    return success(lead);
  }

  async updateLead(data: any) {
    await this.mustOwn('lead', data.id, data.organizationId);
    const upd: any = {};
    for (const k of ['name', 'company', 'email', 'phone', 'source', 'status', 'ownerId', 'notes', 'address', 'lat', 'lng']) {
      if (data[k] !== undefined) upd[k] = data[k];
    }
    const lead = await this.prisma.lead.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'lead', 'updated', data.id);
    return success(lead);
  }

  async deleteLead(data: { organizationId: string; id: string }) {
    await this.mustOwn('lead', data.id, data.organizationId);
    await this.prisma.lead.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'lead', 'deleted', data.id);
    return success({ id: data.id });
  }

  /** Convert a lead → CUSTOMER space (account) + contact + deal, atomically. */
  async convertLead(data: { organizationId: string; userId: string; id: string; dealTitle?: string; amountCents?: number; pipelineId?: string }) {
    const lead = await this.prisma.lead.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'CONVERTED') throw new BadRequestException('Lead already converted');

    const { id: defaultPipelineId, firstStageId } = data.pipelineId
      ? { id: data.pipelineId, firstStageId: (await this.firstStage(data.organizationId, data.pipelineId)).id }
      : await this.ensureDefaultPipeline(data.organizationId);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Account = a CUSTOMER-kind space
      const space = await tx.companyLocation.create({
        data: {
          organizationId: data.organizationId,
          name: lead.company || lead.name,
          kind: 'CUSTOMER',
          contactName: lead.name,
          contactEmail: lead.email,
          contactPhone: lead.phone,
          address: lead.address,
          lat: lead.lat,
          lng: lead.lng,
        },
      });
      // 2) Primary contact
      const [firstName, ...rest] = lead.name.split(' ');
      const contact = await tx.contact.create({
        data: {
          organizationId: data.organizationId,
          spaceId: space.id,
          firstName: firstName || lead.name,
          lastName: rest.join(' ') || null,
          email: lead.email,
          phone: lead.phone,
          isPrimary: true,
          ownerId: lead.ownerId,
        },
      });
      // 3) Deal in the default pipeline's first stage
      const deal = await tx.deal.create({
        data: {
          organizationId: data.organizationId,
          title: data.dealTitle || `${lead.company || lead.name} — new deal`,
          spaceId: space.id,
          contactId: contact.id,
          leadId: lead.id,
          ownerId: lead.ownerId,
          pipelineId: defaultPipelineId,
          stageId: firstStageId,
          amountCents: cents(data.amountCents),
          source: lead.source,
        },
      });
      // 4) Mark the lead converted
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: 'CONVERTED',
          convertedSpaceId: space.id,
          convertedContactId: contact.id,
          convertedDealId: deal.id,
          convertedAt: new Date(),
        },
      });
      return { space, contact, deal };
    });

    this.emitChanged(data.organizationId, 'lead', 'converted', data.id);
    return success(result);
  }

  // ══════════════════════════════ DEALS ══════════════════════════════════════

  private dealInclude = {
    stage: true,
    contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  };

  async listDeals(data: { organizationId: string; pipelineId?: string; ownerId?: string; stageId?: string; open?: boolean; search?: string; page?: number; limit?: number }) {
    const page = PAGE(data.page);
    const limit = LIMIT(data.limit);
    const where: any = { organizationId: data.organizationId };
    if (data.pipelineId) where.pipelineId = data.pipelineId;
    if (data.ownerId) where.ownerId = data.ownerId;
    if (data.stageId) where.stageId = data.stageId;
    if (data.open) { where.isWon = false; where.isLost = false; }
    if (data.search) where.title = { contains: data.search, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      this.prisma.deal.findMany({ where, include: this.dealInclude, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.deal.count({ where }),
    ]);
    return paginated(rows, { page, limit, total });
  }

  /** Board view: all open deals for a pipeline, grouped by stage. */
  async getBoard(data: { organizationId: string; pipelineId?: string; ownerId?: string }) {
    const pipelineId = data.pipelineId || (await this.ensureDefaultPipeline(data.organizationId)).id;
    const dealWhere: any = { pipelineId, organizationId: data.organizationId, isWon: false, isLost: false };
    if (data.ownerId) dealWhere.ownerId = data.ownerId; // rep-scoped board
    const [stages, deals] = await Promise.all([
      this.prisma.pipelineStage.findMany({ where: { pipelineId, organizationId: data.organizationId }, orderBy: { position: 'asc' } }),
      this.prisma.deal.findMany({ where: dealWhere, include: this.dealInclude, orderBy: { updatedAt: 'desc' } }),
    ]);
    return success({ pipelineId, stages, deals });
  }

  async getDeal(data: { organizationId: string; id: string }) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      include: { ...this.dealInclude, quotes: { orderBy: { createdAt: 'desc' } }, activities: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return success(deal);
  }

  async createDeal(data: any) {
    let pipelineId = data.pipelineId;
    let stageId = data.stageId;
    if (!pipelineId || !stageId) {
      const def = await this.ensureDefaultPipeline(data.organizationId);
      pipelineId = pipelineId || def.id;
      stageId = stageId || def.firstStageId;
    }
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, organizationId: data.organizationId } });
    if (!stage) throw new BadRequestException('Invalid stage for pipeline');
    const deal = await this.prisma.deal.create({
      data: {
        organizationId: data.organizationId,
        title: data.title,
        spaceId: data.spaceId ?? null,
        contactId: data.contactId ?? null,
        ownerId: data.ownerId ?? null,
        pipelineId,
        stageId,
        amountCents: cents(data.amountCents),
        currency: data.currency ?? 'EUR',
        expectedCloseAt: data.expectedCloseAt ? new Date(data.expectedCloseAt) : null,
        source: data.source ?? null,
        isWon: !!stage.isWon,
        isLost: !!stage.isLost,
        closedAt: stage.isWon || stage.isLost ? new Date() : null,
      },
      include: this.dealInclude,
    });
    this.emitChanged(data.organizationId, 'deal', 'created', deal.id);
    return success(deal);
  }

  async updateDeal(data: any) {
    await this.mustOwn('deal', data.id, data.organizationId);
    const upd: any = {};
    for (const k of ['title', 'spaceId', 'contactId', 'ownerId', 'currency', 'source', 'wonReason', 'lostReason']) {
      if (data[k] !== undefined) upd[k] = data[k];
    }
    if (data.amountCents !== undefined) upd.amountCents = cents(data.amountCents);
    if (data.expectedCloseAt !== undefined) upd.expectedCloseAt = data.expectedCloseAt ? new Date(data.expectedCloseAt) : null;
    const deal = await this.prisma.deal.update({ where: { id: data.id }, data: upd, include: this.dealInclude });
    this.emitChanged(data.organizationId, 'deal', 'updated', data.id);
    return success(deal);
  }

  /** Kanban drag → change stage; derive won/lost + closedAt; book commission on won. */
  async moveDealStage(data: { organizationId: string; id: string; stageId: string; wonReason?: string; lostReason?: string }) {
    const deal = await this.prisma.deal.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!deal) throw new NotFoundException('Deal not found');
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: data.stageId, pipelineId: deal.pipelineId, organizationId: data.organizationId } });
    if (!stage) throw new BadRequestException('Invalid stage for this deal');

    const wasWon = deal.isWon;
    const updated = await this.prisma.deal.update({
      where: { id: data.id },
      data: {
        stageId: stage.id,
        isWon: stage.isWon,
        isLost: stage.isLost,
        closedAt: stage.isWon || stage.isLost ? new Date() : null,
        wonReason: stage.isWon ? data.wonReason ?? deal.wonReason : null,
        lostReason: stage.isLost ? data.lostReason ?? deal.lostReason : null,
      },
      include: this.dealInclude,
    });

    // Book commission the first time a deal is won (BOOKED-basis rules).
    if (stage.isWon && !wasWon && updated.ownerId) {
      await this.bookCommission(updated.organizationId, updated.id, updated.ownerId, updated.amountCents, updated.closedAt || new Date());
    }
    this.emitChanged(data.organizationId, 'deal', 'moved', data.id);
    return success(updated);
  }

  async deleteDeal(data: { organizationId: string; id: string }) {
    await this.mustOwn('deal', data.id, data.organizationId);
    await this.prisma.deal.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'deal', 'deleted', data.id);
    return success({ id: data.id });
  }

  /** Weighted forecast for a pipeline: Σ open amount × stage.probability. */
  async getForecast(data: { organizationId: string; pipelineId?: string }) {
    const pipelineId = data.pipelineId || (await this.ensureDefaultPipeline(data.organizationId)).id;
    const stages = await this.prisma.pipelineStage.findMany({ where: { pipelineId, organizationId: data.organizationId }, orderBy: { position: 'asc' } });
    const deals = await this.prisma.deal.findMany({ where: { pipelineId, organizationId: data.organizationId } });
    let totalOpenCents = 0;
    let weightedCents = 0;
    let wonCents = 0;
    const byStage = stages.map((s) => ({ stageId: s.id, stageName: s.name, count: 0, amountCents: 0 }));
    const stageMap = new Map(byStage.map((b) => [b.stageId, b]));
    const probMap = new Map(stages.map((s) => [s.id, s.probability]));
    for (const d of deals) {
      const bucket = stageMap.get(d.stageId);
      if (bucket) { bucket.count++; bucket.amountCents += d.amountCents; }
      if (d.isWon) { wonCents += d.amountCents; continue; }
      if (d.isLost) continue;
      totalOpenCents += d.amountCents;
      weightedCents += Math.round((d.amountCents * (probMap.get(d.stageId) ?? 0)) / 100);
    }
    return success({ pipelineId, totalOpenCents, weightedCents, wonCents, byStage });
  }

  // ══════════════════════════════ ACTIVITIES ═════════════════════════════════

  async listActivities(data: { organizationId: string; dealId?: string; leadId?: string; contactId?: string; ownerId?: string; page?: number; limit?: number }) {
    const page = PAGE(data.page);
    const limit = LIMIT(data.limit);
    const where: any = { organizationId: data.organizationId };
    if (data.dealId) where.dealId = data.dealId;
    if (data.leadId) where.leadId = data.leadId;
    if (data.contactId) where.contactId = data.contactId;
    if (data.ownerId) where.ownerId = data.ownerId;
    const [rows, total] = await Promise.all([
      this.prisma.salesActivity.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.salesActivity.count({ where }),
    ]);
    return paginated(rows, { page, limit, total });
  }

  async createActivity(data: any) {
    const activity = await this.prisma.salesActivity.create({
      data: {
        organizationId: data.organizationId,
        type: data.type,
        ownerId: data.ownerId ?? null,
        leadId: data.leadId ?? null,
        dealId: data.dealId ?? null,
        contactId: data.contactId ?? null,
        spaceId: data.spaceId ?? null,
        taskId: data.taskId ?? null,
        subject: data.subject ?? null,
        body: data.body ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        doneAt: data.doneAt ? new Date(data.doneAt) : null,
      },
    });
    this.emitChanged(data.organizationId, 'activity', 'created', activity.id);
    return success(activity);
  }

  async updateActivity(data: any) {
    await this.mustOwn('salesActivity', data.id, data.organizationId);
    const upd: any = {};
    for (const k of ['type', 'subject', 'body']) if (data[k] !== undefined) upd[k] = data[k];
    if (data.dueAt !== undefined) upd.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.doneAt !== undefined) upd.doneAt = data.doneAt ? new Date(data.doneAt) : null;
    const activity = await this.prisma.salesActivity.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'activity', 'updated', data.id);
    return success(activity);
  }

  async deleteActivity(data: { organizationId: string; id: string }) {
    await this.mustOwn('salesActivity', data.id, data.organizationId);
    await this.prisma.salesActivity.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'activity', 'deleted', data.id);
    return success({ id: data.id });
  }

  // ══════════════════════════════ QUOTES ═════════════════════════════════════

  private computeQuoteTotals(lineItems: any[], taxRate?: number | null, discountCents = 0) {
    const items = (lineItems || []).map((li) => {
      const quantity = Number(li.quantity) || 0;
      const unitPriceCents = cents(li.unitPriceCents);
      const amountCents = Math.round(quantity * unitPriceCents);
      return { description: String(li.description || ''), quantity, unitPriceCents, amountCents, taskId: li.taskId ?? null };
    });
    const subtotalCents = items.reduce((s, li) => s + li.amountCents, 0);
    const afterDiscount = Math.max(0, subtotalCents - cents(discountCents));
    const taxCents = taxRate ? Math.round(afterDiscount * taxRate) : 0;
    const totalCents = afterDiscount + taxCents;
    return { items, subtotalCents, taxCents, totalCents };
  }

  private async generateQuoteNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QUO-${year}-`;
    const last = await this.prisma.quote.findFirst({
      where: { organizationId, quoteNumber: { startsWith: prefix } },
      orderBy: { quoteNumber: 'desc' },
    });
    const lastSeq = last ? parseInt(last.quoteNumber.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
  }

  async listQuotes(data: { organizationId: string; dealId?: string; status?: string; page?: number; limit?: number }) {
    const page = PAGE(data.page);
    const limit = LIMIT(data.limit);
    const where: any = { organizationId: data.organizationId };
    if (data.dealId) where.dealId = data.dealId;
    if (data.status && data.status !== 'all') where.status = data.status;
    const [rows, total] = await Promise.all([
      this.prisma.quote.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.quote.count({ where }),
    ]);
    return paginated(rows, { page, limit, total });
  }

  async getQuote(data: { organizationId: string; id: string }) {
    const quote = await this.prisma.quote.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return success(quote);
  }

  async createQuote(data: any) {
    const { items, subtotalCents, taxCents, totalCents } = this.computeQuoteTotals(data.lineItems, data.taxRate, data.discountCents);
    const quoteNumber = await this.generateQuoteNumber(data.organizationId);
    const quote = await this.prisma.quote.create({
      data: {
        organizationId: data.organizationId,
        quoteNumber,
        status: 'DRAFT',
        dealId: data.dealId ?? null,
        spaceId: data.spaceId ?? null,
        contactId: data.contactId ?? null,
        clientName: data.clientName || 'Client',
        clientEmail: data.clientEmail ?? null,
        clientAddress: data.clientAddress ?? null,
        lineItems: items,
        subtotalCents,
        taxRate: data.taxRate ?? null,
        taxCents,
        discountCents: cents(data.discountCents),
        totalCents,
        currency: data.currency ?? 'EUR',
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        notes: data.notes ?? null,
        createdById: data.userId,
      },
    });
    this.emitChanged(data.organizationId, 'quote', 'created', quote.id);
    return success(quote);
  }

  async updateQuote(data: any) {
    const quote = await this.prisma.quote.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!quote) throw new NotFoundException('Quote not found');
    const upd: any = {};
    for (const k of ['clientName', 'clientEmail', 'clientAddress', 'notes', 'currency', 'dealId', 'spaceId', 'contactId']) {
      if (data[k] !== undefined) upd[k] = data[k];
    }
    if (data.validUntil !== undefined) upd.validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (data.lineItems !== undefined || data.taxRate !== undefined || data.discountCents !== undefined) {
      const lineItems = data.lineItems ?? (quote.lineItems as any[]);
      const taxRate = data.taxRate !== undefined ? data.taxRate : quote.taxRate;
      const discountCents = data.discountCents !== undefined ? data.discountCents : quote.discountCents;
      const totals = this.computeQuoteTotals(lineItems, taxRate, discountCents);
      upd.lineItems = totals.items;
      upd.subtotalCents = totals.subtotalCents;
      upd.taxRate = taxRate;
      upd.taxCents = totals.taxCents;
      upd.discountCents = cents(discountCents);
      upd.totalCents = totals.totalCents;
    }
    const updated = await this.prisma.quote.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'quote', 'updated', data.id);
    return success(updated);
  }

  async setQuoteStatus(data: { organizationId: string; id: string; status: string }) {
    const quote = await this.prisma.quote.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!quote) throw new NotFoundException('Quote not found');
    const upd: any = { status: data.status };
    if (data.status === 'SENT' && !quote.sentAt) upd.sentAt = new Date();
    if (data.status === 'ACCEPTED') upd.acceptedAt = new Date();
    const updated = await this.prisma.quote.update({ where: { id: data.id }, data: upd });

    // Accepting a quote wins its deal (books commission through the shared path).
    if (data.status === 'ACCEPTED' && quote.dealId) {
      const wonStage = await this.prisma.pipelineStage.findFirst({
        where: { organizationId: data.organizationId, isWon: true, pipeline: { deals: { some: { id: quote.dealId } } } },
      });
      if (wonStage) {
        await this.moveDealStage({ organizationId: data.organizationId, id: quote.dealId, stageId: wonStage.id, wonReason: `Quote ${quote.quoteNumber} accepted` });
      }
    }
    this.emitChanged(data.organizationId, 'quote', 'status', data.id);
    return success(updated);
  }

  async deleteQuote(data: { organizationId: string; id: string }) {
    await this.mustOwn('quote', data.id, data.organizationId);
    await this.prisma.quote.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'quote', 'deleted', data.id);
    return success({ id: data.id });
  }

  /** Turn an accepted quote into a Ledger invoice (cents → currency units). */
  async convertQuoteToInvoice(data: { organizationId: string; userId: string; id: string }) {
    const quote = await this.prisma.quote.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.invoiceId) throw new BadRequestException('Quote already has an invoice');

    const invoiceNumber = await this.generateInvoiceNumber(data.organizationId);
    const items = (quote.lineItems as any[]) || [];
    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: data.organizationId,
        invoiceNumber,
        status: 'DRAFT',
        spaceId: quote.spaceId,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        clientAddress: quote.clientAddress,
        subtotal: quote.subtotalCents / 100,
        taxRate: quote.taxRate,
        taxAmount: quote.taxCents / 100,
        discount: quote.discountCents / 100,
        total: quote.totalCents / 100,
        currency: quote.currency,
        createdById: data.userId,
        items: {
          create: items.map((li) => ({
            description: li.description || '',
            quantity: Number(li.quantity) || 1,
            unitPrice: cents(li.unitPriceCents) / 100,
            amount: cents(li.amountCents) / 100,
            taskId: li.taskId ?? null,
          })),
        },
      },
    });
    await this.prisma.quote.update({ where: { id: quote.id }, data: { invoiceId: invoice.id } });
    this.emitChanged(data.organizationId, 'quote', 'invoiced', data.id);
    return success({ quoteId: quote.id, invoiceId: invoice.id, invoiceNumber });
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { organizationId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
    });
    const lastSeq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
  }

  // ══════════════════════════════ COMMISSIONS ════════════════════════════════

  async listCommissionRules(data: { organizationId: string }) {
    const rules = await this.prisma.commissionRule.findMany({ where: { organizationId: data.organizationId }, orderBy: { createdAt: 'desc' } });
    return success(rules);
  }

  async createCommissionRule(data: any) {
    const rule = await this.prisma.commissionRule.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        percent: Number(data.percent) || 0,
        basis: data.basis ?? 'PAID',
        userId: data.userId ?? null,
        isActive: data.isActive ?? true,
      },
    });
    this.emitChanged(data.organizationId, 'commissionRule', 'created', rule.id);
    return success(rule);
  }

  async updateCommissionRule(data: any) {
    await this.mustOwn('commissionRule', data.id, data.organizationId);
    const upd: any = {};
    for (const k of ['name', 'basis', 'userId', 'isActive']) if (data[k] !== undefined) upd[k] = data[k];
    if (data.percent !== undefined) upd.percent = Number(data.percent) || 0;
    const rule = await this.prisma.commissionRule.update({ where: { id: data.id }, data: upd });
    this.emitChanged(data.organizationId, 'commissionRule', 'updated', data.id);
    return success(rule);
  }

  async deleteCommissionRule(data: { organizationId: string; id: string }) {
    await this.mustOwn('commissionRule', data.id, data.organizationId);
    await this.prisma.commissionRule.delete({ where: { id: data.id } });
    this.emitChanged(data.organizationId, 'commissionRule', 'deleted', data.id);
    return success({ id: data.id });
  }

  async listCommissionEntries(data: { organizationId: string; ownerId?: string; period?: string; status?: string }) {
    const where: any = { organizationId: data.organizationId };
    if (data.ownerId) where.ownerId = data.ownerId;
    if (data.period) where.period = data.period;
    if (data.status && data.status !== 'all') where.status = data.status;
    const entries = await this.prisma.commissionEntry.findMany({ where, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }] });
    return success(entries);
  }

  async setCommissionEntryStatus(data: { organizationId: string; id: string; status: string }) {
    await this.mustOwn('commissionEntry', data.id, data.organizationId);
    const entry = await this.prisma.commissionEntry.update({ where: { id: data.id }, data: { status: data.status as any } });
    this.emitChanged(data.organizationId, 'commissionEntry', 'status', data.id);
    return success(entry);
  }

  /** Create a pending commission line for a won deal (idempotent per deal). */
  private async bookCommission(organizationId: string, dealId: string, ownerId: string, baseCents: number, when: Date) {
    const existing = await this.prisma.commissionEntry.findFirst({ where: { organizationId, dealId } });
    if (existing) return;
    // Most specific matching BOOKED rule wins (rep-specific over org-wide).
    const rule = await this.prisma.commissionRule.findFirst({
      where: { organizationId, isActive: true, basis: 'BOOKED', OR: [{ userId: ownerId }, { userId: null }] },
      orderBy: { userId: 'desc' }, // non-null (rep-specific) sorts before null
    });
    if (!rule) return;
    const period = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
    const amountCents = Math.round((baseCents * rule.percent) / 100);
    await this.prisma.commissionEntry.create({
      data: { organizationId, ownerId, ruleId: rule.id, dealId, baseCents, percent: rule.percent, amountCents, period, status: 'PENDING' },
    });
  }

  // ══════════════════════════════ HELPERS ════════════════════════════════════

  private async firstStage(organizationId: string, pipelineId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { pipelineId, organizationId }, orderBy: { position: 'asc' } });
    if (!stage) throw new BadRequestException('Pipeline has no stages');
    return stage;
  }

  /** Assert a record exists in the org (delegate-style model access). */
  private async mustOwn(model: 'pipeline' | 'contact' | 'lead' | 'deal' | 'salesActivity' | 'quote' | 'commissionRule' | 'commissionEntry', id: string, organizationId: string) {
    const found = await (this.prisma as any)[model].findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!found) throw new NotFoundException(`${model} not found`);
    return found;
  }
}
