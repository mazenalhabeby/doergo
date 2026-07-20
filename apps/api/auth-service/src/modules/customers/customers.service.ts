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
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(data.page || 1, 1);
    const limit = Math.min(Math.max(data.limit || 20, 1), 100);
    const where: Record<string, unknown> = { organizationId: data.organizationId };
    if (data.status === 'active' || !data.status) where.isActive = true;
    else if (data.status === 'inactive') where.isActive = false;
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
      },
      select: customerSelect,
    });
    return { data: customer };
  }

  async update(id: string, organizationId: string, dto: CustomerInput) {
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Customer name is required');
      data.name = name;
    }
    for (const k of ['contactName', 'email', 'phone', 'address', 'notes', 'isActive'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    const customer = await this.prisma.customer.update({ where: { id }, data, select: customerSelect });
    return { data: customer };
  }

  /** Soft-delete (deactivate) — preserves history on tasks/reports. */
  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Customer not found');
    await this.prisma.customer.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }
}
