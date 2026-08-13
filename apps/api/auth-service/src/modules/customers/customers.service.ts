import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CustomerDetail {
  label: string;
  value: string;
}
export interface CustomerInput {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  isPortalResident?: boolean;
  portalId?: string | null;
  spaceId?: string | null; // the space's Customers list this record belongs to (CRM)
  ownerId?: string | null; // sales rep who owns the relationship
  managerIds?: string[] | null; // sales managers assigned to this customer
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  details?: CustomerDetail[] | null; // flexible custom key-value attributes
}

const customerSelect = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  isActive: true,
  isPortalResident: true,
  portalId: true,
  spaceId: true,
  ownerId: true,
  managerIds: true,
  status: true,
  type: true,
  legalName: true,
  website: true,
  industry: true,
  vatId: true,
  regNumber: true,
  details: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Keep only well-formed { label, value } rows with a non-empty label.
function sanitizeDetails(details: unknown): CustomerDetail[] | undefined {
  if (!Array.isArray(details)) return undefined;
  return details
    .filter((d): d is CustomerDetail => !!d && typeof d.label === 'string' && typeof d.value === 'string')
    .map((d) => ({ label: d.label.trim().slice(0, 80), value: d.value.trim().slice(0, 2000) }))
    .filter((d) => d.label.length > 0)
    .slice(0, 30);
}

const MAX_TEXT = 10000; // generous cap for free-text notes / activity bodies
const capText = (s: unknown): string | null =>
  typeof s === 'string' ? s.slice(0, MAX_TEXT) : (s == null ? null : String(s).slice(0, MAX_TEXT));

const REMINDER_KINDS = ['CALL', 'EMAIL', 'MEETING', 'OTHER'];
function normalizeReminderKind(kind?: string | null): string {
  const k = (kind ?? '').toUpperCase();
  return REMINDER_KINDS.includes(k) ? k : 'OTHER';
}

const REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];
function normalizeRepeat(r?: string | null): string {
  const v = (r ?? '').toUpperCase();
  return REPEATS.includes(v) ? v : 'NONE';
}
function advanceDate(from: Date, repeat: string): Date {
  const d = new Date(from);
  if (repeat === 'DAILY') d.setDate(d.getDate() + 1);
  else if (repeat === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (repeat === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  return d;
}

// Normalize a list of user ids: strings only, trimmed, de-duplicated, capped.
function sanitizeIds(ids: unknown): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  return Array.from(
    new Set(ids.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)),
  ).slice(0, 15);
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** List an org's customers (search + active filter + pagination). */
  async list(data: {
    organizationId: string;
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    portalResident?: boolean; // true = B2C residents only; false = B2B customers only
    portalId?: string; // residents in a specific portal
    spaceId?: string; // a space's Customers list (CRM)
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(data.page || 1, 1);
    const limit = Math.min(Math.max(data.limit || 20, 1), 100);
    const where: Record<string, unknown> = { organizationId: data.organizationId };
    if (data.status === 'active' || !data.status) where.isActive = true;
    else if (data.status === 'inactive') where.isActive = false;
    if (typeof data.portalResident === 'boolean') where.isPortalResident = data.portalResident;
    if (data.portalId) where.portalId = data.portalId;
    if (data.spaceId) where.spaceId = data.spaceId;
    if (data.search) {
      where.OR = [
        { name: { contains: data.search, mode: 'insensitive' } },
        { contactName: { contains: data.search, mode: 'insensitive' } },
        { email: { contains: data.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data: items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async get(id: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: customerSelect,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return { data: customer };
  }

  async create(organizationId: string, dto: CustomerInput) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException('Customer name is required');
    await this.assertRefsInOrg(dto, organizationId);
    // ownerId must be a real member of this org (else drop it).
    const ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;
    // Assigned managers must be real members of THIS org (default: the creator).
    const managerIds = await this.keepOrgUserIds(
      sanitizeIds(dto.managerIds) ?? (ownerId ? [ownerId] : []),
      organizationId,
    );
    const customer = await this.prisma.customer.create({
      data: {
        organizationId,
        name,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: capText(dto.notes),
        isPortalResident: dto.isPortalResident ?? false,
        portalId: dto.portalId ?? null,
        spaceId: dto.spaceId ?? null,
        ownerId,
        // Default: the creating owner is the first assigned manager (org-validated).
        managerIds,
        type: dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON',
        legalName: dto.legalName ?? null,
        website: dto.website ?? null,
        industry: dto.industry ?? null,
        vatId: dto.vatId ?? null,
        regNumber: dto.regNumber ?? null,
        details: (sanitizeDetails(dto.details) ?? undefined) as any,
      },
      select: customerSelect,
    });
    return { data: customer };
  }

  async update(id: string, organizationId: string, dto: CustomerInput, actorId?: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true, status: true, isPortalResident: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Customer name is required');
      data.name = name;
    }
    for (const k of ['contactName', 'email', 'phone', 'address', 'notes', 'isActive', 'spaceId', 'ownerId', 'isPortalResident', 'portalId', 'status', 'legalName', 'website', 'industry', 'vatId', 'regNumber'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.notes !== undefined) data.notes = capText(dto.notes);
    if (dto.type !== undefined) data.type = dto.type === 'COMPANY' ? 'COMPANY' : 'PERSON';
    if (dto.details !== undefined) data.details = (sanitizeDetails(dto.details) ?? []) as any;
    if (dto.managerIds !== undefined) data.managerIds = await this.keepOrgUserIds(sanitizeIds(dto.managerIds) ?? [], organizationId);
    // Cross-tenant guards: refs (space/portal) and ownerId must belong to the org.
    await this.assertRefsInOrg(dto, organizationId);
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId ? ((await this.keepOrgUserIds([dto.ownerId], organizationId))[0] ?? null) : null;

    // ── Smart app-access handoff ──
    // When a customer gains app access, they're self-serve: sales stops working
    // them. Clear the assigned managers and settle the stage to CUSTOMER. This
    // is the single source of truth so every path (invite, manual toggle) agrees.
    const becameApp = dto.isPortalResident === true && !existing.isPortalResident;
    if (becameApp) {
      data.managerIds = [];
      if (dto.status === undefined) data.status = 'CUSTOMER';
    }

    const finalStatus = (data.status as string | undefined) ?? existing.status;
    const customer = await this.prisma.customer.update({ where: { id }, data, select: customerSelect });

    // Auto-log a lifecycle-stage change onto the CRM timeline.
    if (data.status !== undefined && data.status !== existing.status) {
      await this.prisma.customerActivity.create({
        data: { organizationId, customerId: id, type: 'STATUS', authorId: actorId ?? null, metadata: { from: existing.status, to: finalStatus } },
      });
    }
    // Note the handoff explicitly so the timeline explains why managers cleared.
    if (becameApp) {
      await this.prisma.customerActivity.create({
        data: { organizationId, customerId: id, type: 'SYSTEM', authorId: actorId ?? null, body: 'Gained app access — sales handoff complete, managers unassigned.' },
      });
    }
    return { data: customer };
  }

  // ── CRM activity timeline ──────────────────────────────────────────────────

  private async assertCustomer(customerId: string, organizationId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
  }

  /** Keep only ids that are real users in THIS org (drops cross-tenant / stale
   *  ids so manager assignment & reminder targeting never point out-of-org). */
  private async keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true } });
    const ok = new Set(rows.map((r) => r.id));
    return ids.filter((id) => ok.has(id));
  }

  /** A customer's spaceId/portalId MUST belong to the same org — otherwise a
   *  staff user could point their customer at another org's space or portal
   *  (portal-config leak to their own app users). Validated on every write. */
  private async assertRefsInOrg(dto: CustomerInput, organizationId: string) {
    if (dto.spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: dto.spaceId, organizationId }, select: { id: true } });
      if (!s) throw new BadRequestException('Invalid space for this organization');
    }
    if (dto.portalId) {
      const p = await this.prisma.portal.findFirst({ where: { id: dto.portalId, organizationId }, select: { id: true } });
      if (!p) throw new BadRequestException('Invalid portal for this organization');
    }
  }

  /** Timeline (newest first), author names resolved. */
  async listActivities(data: { customerId: string; organizationId: string }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    const rows = await this.prisma.customerActivity.findMany({
      where: { customerId: data.customerId, organizationId: data.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean) as string[])];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));
    return { data: rows.map((r) => ({ ...r, author: r.authorId ? byId.get(r.authorId) ?? null : null })) };
  }

  async addActivity(data: {
    customerId: string; organizationId: string; type?: string; body?: string; dueAt?: string; authorId?: string;
    reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string;
  }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    const type = (data.type ?? 'NOTE') as any;
    const isReminder = type === 'REMINDER';
    const dueAt = data.dueAt ? new Date(data.dueAt) : null;
    const remindBeforeMin = isReminder ? Math.max(0, Math.floor(data.remindBeforeMin ?? 0)) : null;
    // A reminder assignee must be a member of this org (else drop → all managers).
    const assigneeId = isReminder && data.reminderAssigneeId
      ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
      : null;
    const activity = await this.prisma.customerActivity.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        type,
        body: capText(data.body),
        authorId: data.authorId ?? null,
        dueAt,
        reminderKind: isReminder ? normalizeReminderKind(data.reminderKind) : null,
        remindBeforeMin,
        notifyAt: isReminder && dueAt ? new Date(dueAt.getTime() - (remindBeforeMin ?? 0) * 60000) : null,
        reminderAssigneeId: assigneeId,
        repeat: isReminder ? normalizeRepeat(data.repeat) : 'NONE',
      },
    });
    return { data: activity };
  }

  async updateActivity(data: {
    id: string; customerId: string; organizationId: string; body?: string; dueAt?: string | null; done?: boolean;
    reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string;
  }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    const existing = await this.prisma.customerActivity.findFirst({
      where: { id: data.id, customerId: data.customerId },
      select: { dueAt: true, remindBeforeMin: true, repeat: true, reminderKind: true, body: true, authorId: true, reminderAssigneeId: true, doneAt: true },
    });
    if (!existing) throw new NotFoundException('Activity not found');

    const upd: Record<string, unknown> = {};
    if (data.body !== undefined) upd.body = capText(data.body);
    if (data.dueAt !== undefined) upd.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.done !== undefined) upd.doneAt = data.done ? new Date() : null;
    if (data.reminderKind !== undefined) upd.reminderKind = normalizeReminderKind(data.reminderKind);
    if (data.remindBeforeMin !== undefined) upd.remindBeforeMin = Math.max(0, Math.floor(data.remindBeforeMin));
    if (data.reminderAssigneeId !== undefined) {
      upd.reminderAssigneeId = data.reminderAssigneeId
        ? ((await this.keepOrgUserIds([data.reminderAssigneeId], data.organizationId))[0] ?? null)
        : null;
    }
    if (data.repeat !== undefined) upd.repeat = normalizeRepeat(data.repeat);

    // Recompute the fire time whenever the due time or lead changes, and re-arm
    // the notification (clear notifiedAt) so a rescheduled/snoozed reminder fires again.
    if (data.dueAt !== undefined || data.remindBeforeMin !== undefined) {
      const due = (upd.dueAt as Date | null | undefined) ?? existing.dueAt ?? null;
      const lead = (upd.remindBeforeMin as number | undefined) ?? existing.remindBeforeMin ?? 0;
      upd.notifyAt = due ? new Date(due.getTime() - lead * 60000) : null;
      upd.notifiedAt = null;
    }
    const activity = await this.prisma.customerActivity.update({ where: { id: data.id }, data: upd });

    // Recurrence: completing a repeating reminder spawns the next occurrence.
    const justCompleted = data.done === true && !existing.doneAt;
    const repeat = (upd.repeat as string | undefined) ?? existing.repeat ?? 'NONE';
    if (justCompleted && repeat !== 'NONE' && existing.dueAt) {
      const nextDue = advanceDate(existing.dueAt, repeat);
      const lead = existing.remindBeforeMin ?? 0;
      await this.prisma.customerActivity.create({
        data: {
          organizationId: data.organizationId,
          customerId: data.customerId,
          type: 'REMINDER',
          body: existing.body ?? null,
          authorId: existing.authorId ?? null,
          reminderKind: existing.reminderKind ?? 'OTHER',
          remindBeforeMin: lead,
          dueAt: nextDue,
          notifyAt: new Date(nextDue.getTime() - lead * 60000),
          reminderAssigneeId: existing.reminderAssigneeId ?? null,
          repeat,
        },
      });
    }
    return { data: activity };
  }

  async deleteActivity(data: { id: string; customerId: string; organizationId: string }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    await this.prisma.customerActivity.deleteMany({ where: { id: data.id, customerId: data.customerId } });
    return { success: true };
  }

  /** Soft-delete (deactivate) — preserves history on tasks/reports. */
  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    // Grab the portal login ids first so the gateway can bust their cached tokens
    // (instant revocation, not just at the 60s cache TTL).
    const portalUsers = await this.prisma.user.findMany({ where: { customerId: id }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { isActive: false } }),
      // Revoke portal access: deactivate the customer's login accounts so the
      // existing User.isActive gate (login + validateToken) locks them out.
      this.prisma.user.updateMany({ where: { customerId: id }, data: { isActive: false } }),
    ]);
    return { success: true, deactivatedUserIds: portalUsers.map((u) => u.id) };
  }
}
