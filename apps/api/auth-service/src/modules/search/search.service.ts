import { Injectable } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Lightweight, org-scoped people + customer search for the global command
 * palette. Selects ONLY the fields the palette renders, always filtered to the
 * caller's own organization. "People" = staff members (excludes portal
 * customers); customers = the separate Customer entity.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(data: { organizationId: string; query: string; limit?: number }) {
    const q = (data.query || '').trim().slice(0, 100);
    if (!data.organizationId || q.length < 2) return { members: [], customers: [] };
    const take = Math.min(Math.max(1, data.limit ?? 6), 10);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [members, customers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId: data.organizationId,
          role: { not: Role.CUSTOMER }, // staff only, never portal-customer accounts
          OR: [{ firstName: contains }, { lastName: contains }, { email: contains }],
        },
        select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        orderBy: [{ firstName: 'asc' }],
        take,
      }),
      this.prisma.customer.findMany({
        where: {
          organizationId: data.organizationId,
          OR: [{ name: contains }, { contactName: contains }, { email: contains }],
        },
        select: { id: true, name: true, contactName: true },
        orderBy: [{ name: 'asc' }],
        take,
      }),
    ]);

    return { members, customers };
  }
}
