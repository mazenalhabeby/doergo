import { Injectable } from '@nestjs/common';
import type { SpaceRoleWrite } from '@hbcfield/shared/microservices';
import { PrismaService } from '@hbcfield/shared';
import { jsonColumn } from '../../common/records/json-column';

/**
 * Workspace roles written on task-service's behalf: auth-service owns AccessRole (docs/data-ownership.md,
 * group D). task-service decided every column (name free, ceiling, a work role grants nothing); this
 * writes it, and only ever a SPACE/BOTH role of the caller's own organization.
 */
@Injectable()
export class SpaceRoleWritesService {
  constructor(private readonly prisma: PrismaService) {}

  private data(w: SpaceRoleWrite) {
    const { permissions, ...rest } = w;
    return { ...rest, ...(permissions !== undefined ? { permissions: jsonColumn(permissions) } : {}) };
  }

  async create(input: { organizationId: string; role: SpaceRoleWrite & { name: string; slug: string } }) {
    const role = await this.prisma.accessRole.create({
      data: {
        ...this.data(input.role),
        name: input.role.name,
        slug: input.role.slug,
        organizationId: input.organizationId,
        scope: input.role.scope ?? 'SPACE',
        permissions: jsonColumn(input.role.permissions ?? {}),
      },
    });
    return { success: true as const, data: role };
  }

  async update(input: { organizationId: string; roleId: string; patch: SpaceRoleWrite }) {
    const found = await this.prisma.accessRole.findFirst({
      where: { id: input.roleId, organizationId: input.organizationId, scope: { in: ['SPACE', 'BOTH'] } },
      select: { id: true },
    });
    if (!found) return { success: false as const, message: 'Space role not found' };
    const role = await this.prisma.accessRole.update({ where: { id: found.id }, data: this.data(input.patch) });
    return { success: true as const, data: role };
  }
}
