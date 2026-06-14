import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    try {
      const roles = await this.prisma.orgRole.findMany({
        where: { organizationId },
        orderBy: { position: 'asc' },
        include: {
          _count: { select: { users: true } },
        },
      });

      return { success: true, data: roles };
    } catch (error) {
      this.logger.error(`Failed to list roles: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to list roles' };
    }
  }

  async findOne(id: string, organizationId: string) {
    try {
      const role = await this.prisma.orgRole.findFirst({
        where: { id, organizationId },
        include: {
          _count: { select: { users: true } },
        },
      });

      if (!role) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Role not found' };
      }

      return { success: true, data: role };
    } catch (error) {
      this.logger.error(`Failed to get role: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to get role' };
    }
  }

  async create(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
  }) {
    try {
      const slug = slugify(data.name);

      // Check for duplicate slug
      const existing = await this.prisma.orgRole.findUnique({
        where: { organizationId_slug: { organizationId: data.organizationId, slug } },
      });

      if (existing) {
        return { success: false, statusCode: HttpStatus.CONFLICT, message: 'A role with this name already exists' };
      }

      // Get max position for ordering
      const maxPos = await this.prisma.orgRole.aggregate({
        where: { organizationId: data.organizationId },
        _max: { position: true },
      });

      const role = await this.prisma.orgRole.create({
        data: {
          organizationId: data.organizationId,
          name: data.name,
          slug,
          description: data.description || null,
          color: data.color || '#6b7280',
          isSystem: false,
          position: (maxPos._max.position ?? -1) + 1,
          permissions: {
            canCreateTasks: false,
            canViewAllTasks: false,
            canAssignTasks: false,
            canDeleteTasks: false,
            canEditAnyTask: false,
            canManageUsers: false,
            canInviteUsers: false,
            canManageRoles: false,
            canViewAttendance: false,
            canApproveTimeOff: false,
            canApproveOvertime: false,
            canManageLocations: false,
            canManageWorkflows: false,
            canManageOrgSettings: false,
            taskCreationScope: 'NONE',
          },
        },
        include: {
          _count: { select: { users: true } },
        },
      });

      return { success: true, data: role };
    } catch (error) {
      this.logger.error(`Failed to create role: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to create role' };
    }
  }

  async update(id: string, organizationId: string, data: {
    name?: string;
    description?: string;
    color?: string;
  }) {
    try {
      const role = await this.prisma.orgRole.findFirst({
        where: { id, organizationId },
      });

      if (!role) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Role not found' };
      }

      const updateData: any = {};

      if (data.name !== undefined) {
        const newSlug = slugify(data.name);
        // Check for slug collision (but allow if it's the same role)
        const existing = await this.prisma.orgRole.findUnique({
          where: { organizationId_slug: { organizationId, slug: newSlug } },
        });
        if (existing && existing.id !== id) {
          return { success: false, statusCode: HttpStatus.CONFLICT, message: 'A role with this name already exists' };
        }
        updateData.name = data.name;
        updateData.slug = newSlug;
      }

      if (data.description !== undefined) updateData.description = data.description;
      if (data.color !== undefined) updateData.color = data.color;

      const updated = await this.prisma.orgRole.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { users: true } },
        },
      });

      return { success: true, data: updated };
    } catch (error) {
      this.logger.error(`Failed to update role: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to update role' };
    }
  }

  async updatePermissions(id: string, organizationId: string, permissions: Record<string, any>) {
    try {
      const role = await this.prisma.orgRole.findFirst({
        where: { id, organizationId },
        include: { users: { select: { id: true } } },
      });

      if (!role) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Role not found' };
      }

      // Merge with existing permissions to preserve unknown keys
      const existingPerms = (role.permissions as Record<string, any>) || {};
      const mergedPerms = { ...existingPerms, ...permissions };

      // Update role permissions
      const updated = await this.prisma.orgRole.update({
        where: { id },
        data: { permissions: mergedPerms },
        include: {
          _count: { select: { users: true } },
        },
      });

      // Sync all users with this role
      if (role.users.length > 0) {
        const userIds = role.users.map((u) => u.id);
        await this.bulkSyncUserPermissions(userIds, mergedPerms);
        this.logger.log(`Synced permissions for ${userIds.length} users with role ${role.name}`);
      }

      return { success: true, data: updated };
    } catch (error) {
      this.logger.error(`Failed to update role permissions: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to update permissions' };
    }
  }

  async delete(id: string, organizationId: string) {
    try {
      const role = await this.prisma.orgRole.findFirst({
        where: { id, organizationId },
        include: {
          users: { select: { id: true } },
          _count: { select: { users: true } },
        },
      });

      if (!role) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Role not found' };
      }

      if (role.isSystem) {
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'System roles cannot be deleted' };
      }

      // Find the default Employee role to reassign users
      const defaultRole = await this.prisma.orgRole.findFirst({
        where: { organizationId, slug: 'employee', isSystem: true },
      });

      await this.prisma.$transaction(async (tx) => {
        // Reassign users to default role
        if (role.users.length > 0 && defaultRole) {
          const userIds = role.users.map((u) => u.id);
          const defaultPerms = (defaultRole.permissions as Record<string, any>) || {};

          await tx.user.updateMany({
            where: { id: { in: userIds } },
            data: {
              orgRoleId: defaultRole.id,
              canCreateTasks: defaultPerms.canCreateTasks ?? false,
              canViewAllTasks: defaultPerms.canViewAllTasks ?? false,
              canAssignTasks: defaultPerms.canAssignTasks ?? false,
              canManageUsers: defaultPerms.canManageUsers ?? false,
              taskCreationScope: defaultPerms.taskCreationScope ?? 'NONE',
            },
          });
        }

        // Delete the role
        await tx.orgRole.delete({ where: { id } });
      });

      return { success: true, data: null, message: `Role deleted. ${role._count.users} user(s) reassigned.` };
    } catch (error) {
      this.logger.error(`Failed to delete role: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to delete role' };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async bulkSyncUserPermissions(userIds: string[], permissions: Record<string, any>) {
    await this.prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        canCreateTasks: permissions.canCreateTasks ?? false,
        canViewAllTasks: permissions.canViewAllTasks ?? false,
        canAssignTasks: permissions.canAssignTasks ?? false,
        canManageUsers: permissions.canManageUsers ?? false,
        taskCreationScope: permissions.taskCreationScope ?? 'NONE',
      },
    });
  }

  async syncUserPermissions(userId: string, permissions: Record<string, any>) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        canCreateTasks: permissions.canCreateTasks ?? false,
        canViewAllTasks: permissions.canViewAllTasks ?? false,
        canAssignTasks: permissions.canAssignTasks ?? false,
        canManageUsers: permissions.canManageUsers ?? false,
        taskCreationScope: permissions.taskCreationScope ?? 'NONE',
      },
    });
  }
}
