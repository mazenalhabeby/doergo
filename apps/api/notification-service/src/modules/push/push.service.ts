import { memberNotificationPrefs } from '@hbcfield/shared';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { DEFAULT_LOCALE, PrismaService, type SupportedLocale } from '@hbcfield/shared';
import { pushRouting, pushCategory, memberWantsPush, barePushToken } from '@hbcfield/shared';
import { RecipientLocales } from '../../i18n/recipient-locales.service';
import { renderText, type LocalizedText } from '../../i18n/translate';
import { PushTarget } from './push-helpers';
import { ClockPushBudgetService } from './clock-push-budget.service';

export {
  shiftEscalationText,
  noShowEscalationText,
  overtimeRequestText,
  geofenceAlertText,
  pendingApprovalText,
  taskStatus,
  restName,
  duration,
} from './push-helpers';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locales: RecipientLocales,
    // The daily budget of clock nudges (clock-push-budget.ts); optional so a bare test construction still sends.
    @Optional() private readonly clockBudget?: ClockPushBudgetService,
  ) {
    this.expo = new Expo();
  }

  private readonly expo: Expo;

  /**
   * Register a push token for a user — and, when the app says so, the language
   * it is set to. This is the one call every phone makes on every launch, so it
   * is where an app that has changed language (or was installed before the
   * server asked) is sure to be heard. An app that sends no locale changes
   * nothing: an old build must not reset somebody back to English.
   */
  async registerPushToken(data: {
    userId: string;
    token: string;
    platform: string;
    deviceId?: string;
    locale?: string;
  }) {
    const { userId, token, platform, deviceId } = data;

    // Validate the token format
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid Expo push token: ${token}`);
      return { success: false, error: 'Invalid push token format' };
    }

    // Upsert the token (create or update if exists)
    const pushToken = await this.prisma.userPushToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        deviceId,
        updatedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        deviceId,
      },
    });

    if (data.locale !== undefined) await this.locales.set(userId, data.locale);

    this.logger.log(`Registered push token for user ${userId}: ${token.substring(0, 20)}...`);
    return { success: true, data: pushToken };
  }

  /**
   * Remove a push token
   */
  /**
   * Unregister one device.
   *
   * ⚠️ `userId` is required in practice and the caller has always passed it —
   * this method simply ignored it and deleted by token alone. `token` is
   * unique, so that let anyone who knew a token string unregister somebody
   * else's phone. Scoped now; called without one (nothing does) it still falls
   * back to the old behaviour rather than silently doing nothing.
   */
  /** Right to erasure: every push token of the member, on every phone. Safe to repeat. */
  async eraseMember(userId: string) {
    const { count } = await this.prisma.userPushToken.deleteMany({ where: { userId } });
    return { success: true, data: { tokensRemoved: count } };
  }

  async removePushToken(rawToken: string, userId?: string) {
    // The bare token: phones before the fix sent `token|language` and matched nothing.
    const token = barePushToken(rawToken);
    if (!token) return { success: false, error: 'Token not found' };
    try {
      const { count } = await this.prisma.userPushToken.deleteMany({
        where: userId ? { token, userId } : { token },
      });
      return count > 0 ? { success: true } : { success: false, error: 'Token not found' };
    } catch {
      return { success: false, error: 'Token not found' };
    }
  }

  /**
   * One text to many people, each in their own language.
   *
   * Tokens and languages are each ONE query for the whole list. Duplicate and
   * empty ids are dropped here, so a caller merging watchers with leaders does
   * not buzz somebody twice.
   */
  async sendToUsers(userIds: Array<string | null | undefined>, text: LocalizedText, data?: Record<string, any>) {
    let ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return { success: true, sent: 0, reason: 'no_recipients' };

    /*
      The member's own switches (Profile → Notifications: jobs, clock and
      shifts, time off). One query, and only for a push that falls under one —
      a message or a document to sign always goes.
    */
    if (pushCategory(data?.type)) {
      const prefs: Array<{ id: string; notificationPrefs: unknown }> = await memberNotificationPrefs(this.prisma, ids);
      const off = new Set(prefs.filter((u) => !memberWantsPush(u.notificationPrefs, data?.type)).map((u) => u.id));
      if (off.size) ids = ids.filter((id) => !off.has(id));
      if (ids.length === 0) return { success: true, sent: 0, reason: 'switched_off' };
    }

    // At most four clock nudges a day, a kind repeated at most once — counted only for people still asked.
    if (this.clockBudget) {
      ids = await this.clockBudget.allowed(ids, data?.type);
      if (ids.length === 0) return { success: true, sent: 0, reason: 'clock_budget' };
    }

    const rows: Array<{ userId: string; token: string }> = await this.prisma.userPushToken.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, token: true },
    });
    if (rows.length === 0) {
      this.logger.warn(`No push tokens registered for ${ids.length} recipient(s) of ${data?.type ?? 'a push'}`);
      return { success: true, sent: 0, reason: 'no_tokens_registered' };
    }

    const localeOf = await this.locales.localesFor([...new Set(rows.map((r) => r.userId))]);
    const byLocale = new Map<SupportedLocale, PushTarget[]>();
    for (const row of rows) {
      const locale = localeOf.get(row.userId) ?? DEFAULT_LOCALE;
      const list = byLocale.get(locale) ?? [];
      list.push({ token: row.token, userId: row.userId });
      byLocale.set(locale, list);
    }

    let sent = 0;
    let failed = 0;
    for (const [locale, tokens] of byLocale) {
      const { title, body } = renderText(locale, text);
      const result = await this.deliver(tokens, title, body, data);
      sent += result.sent;
      failed += result.failed;
    }
    return { success: true, sent, failed };
  }

  /**
   * One notification per PERSON, to the phone they used most recently — for a message about the
   * person rather than about a moment (a new app version). `sendToUsers` reaches every token, and
   * a member who reinstalled ten times would get ten copies of the same news.
   */
  async sendToNewestDevice(userIds: string[], text: LocalizedText, data?: Record<string, any>) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return { success: true, sent: 0, failed: 0 };
    const rows: Array<{ userId: string; token: string }> = await this.prisma.userPushToken.findMany({
      where: { userId: { in: ids } },
      orderBy: { updatedAt: 'desc' },
      select: { userId: true, token: true },
    });
    const newest = new Map<string, string>();
    for (const r of rows) if (!newest.has(r.userId) && Expo.isExpoPushToken(r.token)) newest.set(r.userId, r.token);
    const localeOf = await this.locales.localesFor([...newest.keys()]);
    const byLocale = new Map<SupportedLocale, PushTarget[]>();
    for (const [userId, token] of newest) {
      const locale = localeOf.get(userId) ?? DEFAULT_LOCALE;
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), { token, userId }]);
    }
    let sent = 0,
      failed = 0;
    for (const [locale, tokens] of byLocale) {
      const { title, body } = renderText(locale, text);
      const r = await this.deliver(tokens, title, body, data);
      sent += r.sent;
      failed += r.failed;
    }
    return { success: true, sent, failed, reached: [...newest.keys()] };
  }

  async sendToUser(userId: string, text: LocalizedText, data?: Record<string, any>) {
    return this.sendToUsers([userId], text, data);
  }

  /** Already rendered, already grouped: hand it to Expo. */
  private async deliver(targets: PushTarget[], title: string, body: string, data?: Record<string, any>) {
    const valid = targets.filter((t) => Expo.isExpoPushToken(t.token));
    const validTokens = valid.map((t) => t.token);
    if (validTokens.length === 0) {
      this.logger.warn('No valid Expo push tokens found');
      return { sent: 0, failed: 0 };
    }

    /*
      Where it lands and how loudly — decided by one shared table, because the
      server names the Android channel and the APP is what creates it. Two
      opinions on that string is a push delivered to a channel nobody registered.

      `interruptionLevel` is the iPhone half: without it a Work Focus or Do Not
      Disturb silences a shift ending and a rest falling due, which are exactly
      the two things worth interrupting for.
    */
    const routing = pushRouting(data?.type);
    /*
      ⚠️ Every push names WHO it was for (`recipientId`). A phone keeps a
      notification across a sign-out, and its buttons (answer an invite, "I'm
      with him") act as whoever is signed in when it is tapped — the app refuses
      to act when the recipient is not the signed-in member.
    */
    const messages: ExpoPushMessage[] = valid.map(({ token, userId }) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: { ...(data ?? {}), recipientId: userId },
      priority: 'high',
      channelId: routing.channelId,
      interruptionLevel: routing.interruptionLevel,
      // A notification with buttons ("I'm with him") names its category; the app registers it.
      ...(typeof data?.category === 'string' ? { categoryId: data.category } : {}),
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        this.logger.error('Error sending push notifications:', error);
      }
    }

    const errors = tickets.filter((ticket) => ticket.status === 'error');
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} push notifications failed`);
    }

    return { sent: tickets.filter((t) => t.status === 'ok').length, failed: errors.length };
  }
}
