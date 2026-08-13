import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  status?: string; // CRM lifecycle stage
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
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

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
    const customer = await this.prisma.customer.create({
      data: {
        organizationId,
        name,
        contactName: dto.contactName ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        isPortalResident: dto.isPortalResident ?? false,
        portalId: dto.portalId ?? null,
        spaceId: dto.spaceId ?? null,
        ownerId: dto.ownerId ?? null,
      },
      select: customerSelect,
    });
    return { data: customer };
  }

  async update(id: string, organizationId: string, dto: CustomerInput, actorId?: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Customer name is required');
      data.name = name;
    }
    for (const k of ['contactName', 'email', 'phone', 'address', 'notes', 'isActive', 'spaceId', 'ownerId', 'isPortalResident', 'portalId', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    const customer = await this.prisma.customer.update({ where: { id }, data, select: customerSelect });
    // Auto-log a lifecycle-stage change onto the CRM timeline.
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.prisma.customerActivity.create({
        data: { organizationId, customerId: id, type: 'STATUS', authorId: actorId ?? null, metadata: { from: existing.status, to: dto.status } },
      });
    }
    return { data: customer };
  }

  // ── CRM activity timeline ──────────────────────────────────────────────────

  private async assertCustomer(customerId: string, organizationId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
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

  async addActivity(data: { customerId: string; organizationId: string; type?: string; body?: string; dueAt?: string; authorId?: string }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    const type = (data.type ?? 'NOTE') as any;
    const activity = await this.prisma.customerActivity.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        type,
        body: data.body ?? null,
        authorId: data.authorId ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
      },
    });
    return { data: activity };
  }

  async updateActivity(data: { id: string; customerId: string; organizationId: string; body?: string; dueAt?: string | null; done?: boolean }) {
    await this.assertCustomer(data.customerId, data.organizationId);
    const upd: Record<string, unknown> = {};
    if (data.body !== undefined) upd.body = data.body;
    if (data.dueAt !== undefined) upd.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.done !== undefined) upd.doneAt = data.done ? new Date() : null;
    const activity = await this.prisma.customerActivity.update({
      where: { id: data.id },
      data: upd,
    });
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
