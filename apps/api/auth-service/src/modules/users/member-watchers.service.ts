import { SERVICE_NAMES, Role } from '@hbcfield/shared';
import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Who is told about a member: the managers watching them.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class MemberWatchersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  /** List the managers/admins watching a specific employee (notifications about them). */
  async getWatchers(subjectUserId: string, organizationId: string) {
    const subject = await this.prisma.user.findFirst({
      where: { id: subjectUserId, organizationId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('Member not found');

    const watches = await this.prisma.notificationWatch.findMany({
      where: { subjectUserId, organizationId },
      select: {
        watcher: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
        },
      },
    });
    return { data: watches.map((w) => w.watcher) };
  }

  /**
   * Replace the full set of watchers for an employee. `watcherIds` must be
   * admins or managers (canViewAllTasks) in the same org. Empty = clear (falls
   * back to default space/admin routing).
   */
  async setWatchers(subjectUserId: string, organizationId: string, watcherIds: string[]) {
    const subject = await this.prisma.user.findFirst({
      where: { id: subjectUserId, organizationId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('Member not found');

    const unique = [...new Set(watcherIds)].filter((id) => id && id !== subjectUserId);

    // Only admins + "Show in Management" members may be watchers
    // (mirrors the eligible-watchers list in the web UI).
    const valid = unique.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: unique },
            organizationId,
            isActive: true,
            // Same definition the picker offers: the ADMIN system role, or an
            // assigned role granting canManageUsers. This previously accepted
            // `memberRoleId: { not: null }` — every member has a role in the
            // unified system, so the check passed for anyone and the server
            // enforced nothing the UI was promising.
            OR: [
              { role: Role.ADMIN },
              { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
            ],
          },
          select: { id: true },
        })
      : [];
    const validIds = valid.map((v) => v.id);

    await this.prisma.$transaction([
      this.prisma.notificationWatch.deleteMany({ where: { subjectUserId, organizationId } }),
      ...(validIds.length
        ? [
            this.prisma.notificationWatch.createMany({
              data: validIds.map((watcherUserId) => ({ subjectUserId, organizationId, watcherUserId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    // Tell task-service to drop its cached recipients for this member. Without
    // it the change took up to the cache TTL to show, so an admin would save,
    // watch the next event go to the old list, and reasonably think it had not
    // worked. Fire-and-forget: if it is lost, the TTL still expires.
    this.taskClient.emit('notification_routing_changed', { organizationId, subjectUserId });

    return this.getWatchers(subjectUserId, organizationId);
  }
}
