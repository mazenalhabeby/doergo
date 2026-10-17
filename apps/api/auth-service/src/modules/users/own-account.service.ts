import {
  normalizeLocale,
  MEMBER_EMAILS,
  MEMBER_NOTIFICATION_PREF_KEYS,
  orgAllowsEmail,
  pickBooleanPrefs,
  normalizeEmail,
} from '@hbcfield/shared';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

/**
 * What a member changes about themselves: profile, email, notification inbox
 * and switches, and the app version their phone reports.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class OwnAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Self-service profile update — a user updating their OWN record. Scoped to
   * `userId` (the authenticated caller), so it needs no permission: unlike
   * `updateMemberProfile` (admin managing others), anyone can edit themselves.
   */
  async updateOwnProfile(
    userId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      presence?: string | null;
      timeFormat?: string;
      guidesSeen?: boolean;
      locale?: string;
      clockInPick?: string;
    },
  ) {
    const data: {
      firstName?: string;
      lastName?: string;
      presence?: string | null;
      timeFormat?: string;
      guidesSeen?: boolean;
      locale?: string;
      clockInPick?: string;
    } = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    // presence: a value sets the manual override; null clears it back to auto.
    if (dto.presence !== undefined) data.presence = dto.presence;
    // timeFormat: per-user clock display ("12h" | "24h"); ignore anything else.
    if (dto.timeFormat === '12h' || dto.timeFormat === '24h') data.timeFormat = dto.timeFormat;
    // clockInPick: with several workspaces, clock in where they stand or always choose.
    if (dto.clockInPick === 'AUTO' || dto.clockInPick === 'ASK') data.clockInPick = dto.clockInPick;
    // guidesSeen: one-time welcome-tour flag (only ever set to true by the client).
    if (dto.guidesSeen === true) data.guidesSeen = true;
    // locale: the language this member's pushes are written in. Only one the
    // server has a catalogue for; anything else leaves the stored value alone.
    const locale = normalizeLocale(dto.locale);
    if (locale) data.locale = locale;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
        presence: true,
        timeFormat: true,
        clockInPick: true,
        guidesSeen: true,
        locale: true,
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Self-service email change — requires the current password (email is the
   * login identity, so we confirm it's really them) and enforces uniqueness.
   * Everything internal keys off userId, so only login is affected.
   */
  async updateOwnEmail(userId: string, data: { newEmail: string; currentPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!validPassword) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newEmail = normalizeEmail(data.newEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new BadRequestException('Invalid email address');
    }
    if (newEmail === normalizeEmail(user.email)) {
      throw new BadRequestException('That is already your email');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('That email is already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
      },
    });

    return { success: true, data: updated };
  }

  /** In-app notification inbox — recent persisted notifications + unread count. */
  async listNotifications(userId: string, limit?: number) {
    const take = Math.min(Math.max(limit || 30, 1), 100);
    const [items, unread] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where: { recipientId: userId, channel: 'SOCKET' },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, eventType: true, payload: true, readAt: true, createdAt: true },
      }),
      this.prisma.notificationDelivery.count({
        where: { recipientId: userId, channel: 'SOCKET', readAt: null },
      }),
    ]);
    return { data: { items, unread } };
  }

  /** Mark inbox notifications read (all unread, or the given ids). */
  async markNotificationsRead(userId: string, ids?: string[]) {
    const where: { recipientId: string; readAt: null; id?: { in: string[] } } = {
      recipientId: userId,
      readAt: null,
    };
    if (ids && ids.length) where.id = { in: ids };
    await this.prisma.notificationDelivery.updateMany({ where, data: { readAt: new Date() } });
    return { success: true };
  }

  /** Get a user's own notification opt-out preferences (category → boolean). */
  async getNotificationPrefs(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true, organization: { select: { notificationPrefs: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      data: {
        prefs: (user.notificationPrefs as Record<string, boolean> | null) ?? {},
        /*
          Which member emails the organization allows at all. A member cannot
          read the organization's settings, and a switch they can flip that does
          nothing — because the ceiling is off — is worse than no switch: the
          screen shows it off and says why.
        */
        organizationAllows: Object.fromEntries(
          MEMBER_EMAILS.map((kind) => [kind, orgAllowsEmail(user.organization?.notificationPrefs, kind)]),
        ),
      },
    };
  }

  /**
   * Merge-update a user's own notification preferences.
   *
   * Only known keys, only booleans. The body is the member's own, but the JSON
   * is read by the notification router and the email sender, and neither should
   * find a string "false" (truthy) or a megabyte of junk in it.
   */
  async updateNotificationPrefs(userId: string, prefs: unknown) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const merged = {
      ...((user.notificationPrefs as Record<string, boolean> | null) ?? {}),
      ...pickBooleanPrefs(prefs, MEMBER_NOTIFICATION_PREF_KEYS),
    };
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: merged } });
    return { data: merged };
  }

  /**
   * Remember which build of the app somebody is on.
   *
   * Guarded by a WHERE on the value itself, so a phone that reports the same
   * version it reported last time performs no write at all — which is every
   * request but the first after an update. That matters: this runs on the hot
   * path for every authenticated mobile request in the system.
   *
   * Version strings are bounded and shape-checked before they reach the
   * database. They arrive in a header, which is to say from anywhere.
   *
   * Failures are swallowed on purpose. This is bookkeeping; it must never turn
   * a working request into a failed one.
   */
  async recordAppVersion(data: { userId: string; version: string; platform?: string }) {
    const version = (data.version || '').trim().slice(0, 32);
    if (!/^\d+\.\d+\.\d+/.test(version)) return { recorded: false };

    const platform = data.platform === 'ios' || data.platform === 'android' ? data.platform : null;

    try {
      const { count } = await this.prisma.user.updateMany({
        where: {
          id: data.userId,
          // The whole point: no write when nothing changed.
          OR: [{ lastAppVersion: { not: version } }, { lastAppVersion: null }],
        },
        data: {
          lastAppVersion: version,
          ...(platform ? { lastAppPlatform: platform } : {}),
          lastAppSeenAt: new Date(),
        },
      });
      return { recorded: count > 0 };
    } catch {
      return { recorded: false };
    }
  }
}
