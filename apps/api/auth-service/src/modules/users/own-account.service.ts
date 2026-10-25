import {
  normalizeLocale,
  MEMBER_EMAILS,
  MEMBER_NOTIFICATION_PREF_KEYS,
  orgAllowsEmail,
  pickBooleanPrefs,
  normalizeEmail,
  isAdmin,
  memberIsClockedIn,
  SERVICE_NAMES,
} from '@hbcfield/shared';
import { Injectable, Inject, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { emitEvent, memberClockSwitchedEvent } from '@hbcfield/shared/microservices';
import { PrismaService } from '@hbcfield/shared';
import * as bcrypt from 'bcryptjs';

/**
 * What a member changes about themselves: profile, email, notification inbox
 * and switches, and the app version their phone reports.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class OwnAccountService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

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
      usesClock?: boolean;
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
      clockOff?: boolean;
    } = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    // presence: a value sets the manual override; null clears it back to auto.
    if (dto.presence !== undefined) data.presence = dto.presence;
    // timeFormat: per-user clock display ("12h" | "24h"); ignore anything else.
    if (dto.timeFormat === '12h' || dto.timeFormat === '24h') data.timeFormat = dto.timeFormat;
    // clockInPick: with several workspaces, clock in where they stand or always choose.
    if (dto.clockInPick === 'AUTO' || dto.clockInPick === 'ASK') data.clockInPick = dto.clockInPick;
    if (dto.usesClock !== undefined) data.clockOff = await this.clockOffFor(userId, dto.usesClock);
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
        clockOff: true,
        organizationId: true,
        guidesSeen: true,
        locale: true,
      },
    });

    if (data.clockOff !== undefined && updated.organizationId) {
      // Task-service owns the rota's expected shifts: off → the ones still ahead are not expected (no chasing).
      emitEvent(this.taskClient, memberClockSwitchedEvent, {
        organizationId: updated.organizationId,
        userId,
        clockOff: data.clockOff,
      });
    }

    return { success: true, data: updated };
  }

  /**
   * An administrator taking themselves off the clock, or back on (review A7). Everyone else's clock is
   * their access profile's `clock` module, set by the office — so the switch is refused for them.
   * Never while a shift is running: the clock would disappear with the shift still open.
   */
  private async clockOffFor(userId: string, usesClock: boolean): Promise<boolean> {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!isAdmin({ role: me?.role ?? '' })) {
      throw new BadRequestException({
        code: 'CLOCK_SWITCH_ADMIN_ONLY',
        message: 'Only an administrator can switch their own clock off.',
      });
    }
    if (!usesClock) {
      if (await memberIsClockedIn(this.prisma, userId)) {
        throw new ConflictException({
          code: 'CLOCK_SWITCH_WHILE_CLOCKED_IN',
          message: 'Clock out first, then switch the clock off.',
        });
      }
    }
    return !usesClock;
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
