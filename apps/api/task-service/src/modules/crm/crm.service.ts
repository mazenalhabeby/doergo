import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, SERVICE_NAMES } from '@hbcfield/shared';

// The seeded "Deal" task type (a StatusWorkflow). Its statuses ARE the pipeline
// stages; `probability` drives the weighted forecast; the final non-canceled
// status = Won, the canceled status = Lost.
const DEAL_WORKFLOW_NAME = 'Deal';
const DEAL_STAGES = [
  { key: 'LEAD', name: 'Lead', position: 0, probability: 10, color: '#3b82f6', transitions: ['QUALIFIED', 'LOST'] },
  { key: 'QUALIFIED', name: 'Qualified', position: 1, probability: 30, color: '#8b5cf6', transitions: ['PROPOSAL', 'LOST'] },
  { key: 'PROPOSAL', name: 'Proposal', position: 2, probability: 60, color: '#f59e0b', transitions: ['NEGOTIATION', 'WON', 'LOST'] },
  { key: 'NEGOTIATION', name: 'Negotiation', position: 3, probability: 80, color: '#f97316', transitions: ['WON', 'LOST'] },
  { key: 'WON', name: 'Won', position: 4, probability: 100, color: '#16a34a', isFinal: true, transitions: [] },
  { key: 'LOST', name: 'Lost', position: 5, probability: 0, color: '#dc2626', isCanceled: true, transitions: [] },
];

const PAGE = (p?: number) => Math.max(1, Number(p) || 1);
const LIMIT = (l?: number) => Math.min(100, Math.max(1, Number(l) || 20));
const cents = (n: any) => Math.max(0, Math.round(Number(n) || 0));

@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  private emitChanged(organizationId: string, entity: string, action: string, id?: string) {
    try {
      this.notificationClient.emit('crm_changed', { organizationId, entity, action, id });
    } catch (err) {
      this.logger.warn(`crm_changed emit failed (${entity}.${action}): ${err}`);
    }
  }

  // ══════════════════════════════ DEAL WORKFLOW (pipeline) ════════════════════

  /** The org's "Deal" pipeline = the StatusWorkflow whose statuses carry a
   *  probability. Seeds one on first use so the sales board works out of the box. */
  async ensureDealWorkflow(organizationId: string) {
    const existing = await this.prisma.statusWorkflow.findFirst({
      where: { organizationId, statuses: { some: { probability: { not: null } } } },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
    if (existing) return existing;

    const workflow = await this.prisma.statusWorkflow.create({
      data: {
        organizationId,
        name: DEAL_WORKFLOW_NAME,
        isDefault: false,
        isActive: true,
        statuses: {
          create: DEAL_STAGES.map((s) => ({
            key: s.key,
            name: s.name,
            position: s.position,
            probability: s.probability,
            color: s.color,
            isFinal: !!s.isFinal,
            isCanceled: !!s.isCanceled,
            transitions: s.transitions,
          })),
        },
      },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
    return workflow;
  }

  /** Sales pipeline board: deal-type tasks grouped by their workflow status +
   *  weighted forecast. A "deal" is a Task on the Deal workflow. */
  async getSalesBoard(data: { organizationId: string; workflowId?: string; ownerId?: string }) {
    const wf = data.workflowId
      ? await this.prisma.statusWorkflow.findFirst({
          where: { id: data.workflowId, organizationId: data.organizationId },
          include: { statuses: { orderBy: { position: 'asc' } } },
        })
      : await this.ensureDealWorkflow(data.organizationId);
    if (!wf) throw new NotFoundException('Deal workflow not found');

    const where: any = { organizationId: data.organizationId, workflowId: wf.id };
    if (data.ownerId) where.assignedToId = data.ownerId; // rep-scoped board
    const tasks = await this.prisma.task.findMany({
      where,
      select: {
        id: true, title: true, status: true, amountCents: true, currency: true,
        spaceId: true, dueDate: true, assignedToId: true,
        space: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const forecast = this.computeForecast(wf.statuses as any[], tasks as any[]);
    return success({ workflow: { id: wf.id, name: wf.name, statuses: wf.statuses }, tasks, forecast });
  }

  async getForecast(data: { organizationId: string; workflowId?: string }) {
    const board: any = await this.getSalesBoard(data);
    return success(board.data.forecast);
  }

  private computeForecast(
    statuses: { key: string; name: string; probability: number | null; isFinal: boolean; isCanceled: boolean }[],
    tasks: { status: string; amountCents: number | null }[],
  ) {
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    const byStatus = statuses.map((s) => ({ statusKey: s.key, statusName: s.name, count: 0, amountCents: 0 }));
    const bucket = new Map(byStatus.map((b) => [b.statusKey, b]));
    let totalOpenCents = 0, weightedCents = 0, wonCents = 0;
    for (const t of tasks) {
      const amt = t.amountCents ?? 0;
      const b = bucket.get(t.status);
      if (b) { b.count++; b.amountCents += amt; }
      const st = byKey.get(t.status);
      if (st?.isFinal && !st.isCanceled) { wonCents += amt; continue; }
      if (st?.isCanceled) continue;
      totalOpenCents += amt;
      weightedCents += Math.round((amt * (st?.probability ?? 0)) / 100);
    }
    return { totalOpenCents, weightedCents, wonCents, byStatus };
  }

  // ══════════════════════════════ COMMISSION-ON-WON HOOK ══════════════════════

  /** Called by TasksService when a task reaches a status: book a commission if it
   *  is a deal (has amountCents) landing on a Won (final, non-canceled) status. */
  async onTaskStatusChanged(task: {
    id: string; organizationId: string; amountCents?: number | null; assignedToId?: string | null;
  }, status: { isFinal: boolean; isCanceled: boolean }) {
    if (!task.amountCents || task.amountCents <= 0) return;
    if (!status.isFinal || status.isCanceled) return; // only Won
    if (!task.assignedToId) return; // no rep to credit
    try {
      await this.bookCommission(task.organizationId, task.id, task.assignedToId, task.amountCents, new Date());
    } catch (err) {
      this.logger.warn(`commission booking failed for task ${task.id}: ${err}`);
    }
  }

  private async bookCommission(organizationId: string, dealTaskId: string, ownerId: string, baseCents: number, when: Date) {
    const existing = await this.prisma.commissionEntry.findFirst({ where: { organizationId, dealId: dealTaskId } });
    if (existing) return;
    const rule = await this.prisma.commissionRule.findFirst({
      where: { organizationId, isActive: true, basis: 'BOOKED', OR: [{ userId: ownerId }, { userId: null }] },
      orderBy: { userId: 'desc' }, // rep-specific rule wins over the org-wide one
    });
    if (!rule) return;
    const period = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
    const amountCents = Math.round((baseCents * rule.percent) / 100);
    await this.prisma.commissionEntry.create({
      data: { organizationId, ownerId, ruleId: rule.id, dealId: dealTaskId, baseCents, percent: rule.percent, amountCents, period, status: 'PENDING' },
    });
    this.emitChanged(organizationId, 'commissionEntry', 'booked', dealTaskId);
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
    return paginated(await this.withSpaceNames(data.organizationId, rows), { page, limit, total });
  }

  async getContact(data: { organizationId: string; id: string }) {
    const contact = await this.prisma.contact.findFirst({ where: { id: data.id, organizationId: data.organizationId } });
    if (!contact) throw new NotFoundException('Contact not found');
    const [enriched] = await this.withSpaceNames(data.organizationId, [contact]);
    return success(enriched);
  }

  /** Attach { space: { id, name } } to contacts (spaceId is a plain marker). */
  private async withSpaceNames<T extends { spaceId: string | null }>(organizationId: string, contacts: T[]) {
    const ids = [...new Set(contacts.map((c) => c.spaceId).filter(Boolean) as string[])];
    if (ids.length === 0) return contacts.map((c) => ({ ...c, space: null }));
    const spaces = await this.prisma.companyLocation.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, name: true } });
    const byId = new Map(spaces.map((s) => [s.id, s]));
    return contacts.map((c) => ({ ...c, space: c.spaceId ? byId.get(c.spaceId) ?? null : null }));
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

  // ══════════════════════════════ HELPERS ════════════════════════════════════

  private async mustOwn(model: 'contact' | 'commissionRule' | 'commissionEntry', id: string, organizationId: string) {
    const found = await (this.prisma as any)[model].findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!found) throw new NotFoundException(`${model} not found`);
    return found;
  }
}
