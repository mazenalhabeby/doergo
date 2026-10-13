import * as Notifications from 'expo-notifications';
import { AUTO_CLOCK_UNDO_MINUTES, PUSH_CHANNELS } from '@hbcfield/shared/client';
import i18n, { i18nReady } from '../../i18n';
import { formatTimeOfDay } from '../../lib/utils';
import { loadStoredUser } from '../../lib/session/stored-user';
import type { ReminderKind } from './rules';

/*
  THE AUTOMATIC CLOCK'S NOTIFICATIONS — local, scheduled on the phone.

  ⚠️ SCHEDULED, NOT SENT LATER. A notification given to the OS with a date is
  delivered on time with no JavaScript running — which is the only way a phone
  that is closed in a pocket can say "clocked in" once the dwell has passed, or
  "rest starts now" at noon. Each carries a button (a category, the JS API on
  both platforms — no native change, OTA-safe, like the calendar's), and each
  button opens the app, which then does the one thing it says.

  One identifier per kind and shift, so scheduling again replaces and a clock-out
  can take back exactly what its clock-in put there.
*/

export const AUTO_CLOCK_NOTIFICATION_TYPE = 'attendance.auto_clock';

export const AUTO_CLOCK_CATEGORIES = {
  in: 'auto_clock_in',
  rest: 'auto_clock_rest',
  end: 'auto_clock_end',
} as const;

export const AUTO_CLOCK_ACTIONS = {
  undo: 'auto_undo',
  skipRest: 'auto_skip_rest',
  clockOut: 'auto_clock_out',
  stillWorking: 'auto_still_working',
} as const;

export type AutoClockAction = (typeof AUTO_CLOCK_ACTIONS)[keyof typeof AUTO_CLOCK_ACTIONS];

export function isAutoClockAction(actionId: string | null | undefined): actionId is AutoClockAction {
  return !!actionId && (Object.values(AUTO_CLOCK_ACTIONS) as string[]).includes(actionId);
}

export const notificationIdFor = (kind: ReminderKind | 'arrived', key: string) => `auto-clock:${kind}:${key}`;

/** What the runner asks of notifications — injected, so the decisions are tested without a phone. */
export interface AutoClockNotifier {
  /** "Clocked in automatically at 07:30 · Undo", shown when the dwell has passed. */
  clockedIn(i: { userId: string; entryId: string; place: string; at: Date; showAt: Date }): Promise<void>;
  /** The planned rest and the "still here?" after the shift — both delivered by the OS on time. */
  reminders(i: {
    userId: string;
    entryId: string;
    place: string;
    rest: { startAt: Date; endAt: Date } | null;
    endAt: Date | null;
    shiftEnd: Date;
    /** Clocked by arriving and leaving: asked after the workspace's hours, not after a shift end. */
    presence?: { hours: number; limit: boolean };
  }): Promise<void>;
  /** Arrived, but the phone could not clock in on its own: "tap to clock in" — or, outside their usual hours, "starting work?". */
  arrivedPrompt(i: { userId: string; spaceId: string; place: string; outsideHours?: boolean }): Promise<void>;
  /** Take back what a shift scheduled (all kinds when none are named). */
  cancel(entryId: string, kinds?: ReminderKind[]): Promise<void>;
}

const ALL_KINDS: ReminderKind[] = ['in', 'rest', 'end'];

async function hour12(): Promise<boolean> {
  return (await loadStoredUser().catch(() => null))?.timeFormat === '12h';
}

async function schedule(input: {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  category?: string;
  at: Date | null;
}): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync().catch(() => ({ status: 'denied' as const }));
  if (status !== 'granted') return;
  const channelId = PUSH_CHANNELS.ATTENDANCE;
  const due = input.at && input.at.getTime() > Date.now() + 1000 ? input.at : null;
  await Notifications.scheduleNotificationAsync({
    identifier: input.identifier,
    content: {
      title: input.title,
      body: input.body,
      data: { type: AUTO_CLOCK_NOTIFICATION_TYPE, ...input.data },
      ...(input.category ? { categoryIdentifier: input.category } : {}),
      ...({ channelId } as object),
    },
    trigger: due ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due, channelId } : null,
  }).catch(() => undefined);
}

/** The real one. */
export const autoClockNotifier: AutoClockNotifier = {
  async clockedIn({ userId, entryId, place, at, showAt }) {
    await i18nReady.catch(() => undefined);
    await schedule({
      identifier: notificationIdFor('in', entryId),
      title: i18n.t('autoClock.push.clockedInTitle'),
      body: i18n.t('autoClock.push.clockedInBody', { place, time: formatTimeOfDay(at, await hour12()), minutes: AUTO_CLOCK_UNDO_MINUTES }),
      // `recipientId`: a button pressed after somebody else signed in on this phone must not act for them.
      data: { kind: 'in', entryId, recipientId: userId, at: at.toISOString() },
      category: AUTO_CLOCK_CATEGORIES.in,
      at: showAt,
    });
  },

  async reminders({ userId, entryId, place, rest, endAt, shiftEnd, presence }) {
    await i18nReady.catch(() => undefined);
    const h12 = await hour12();
    if (rest) {
      await schedule({
        identifier: notificationIdFor('rest', entryId),
        title: i18n.t('autoClock.push.restTitle'),
        body: i18n.t('autoClock.push.restBody', { start: formatTimeOfDay(rest.startAt, h12), end: formatTimeOfDay(rest.endAt, h12) }),
        data: { kind: 'rest', entryId, recipientId: userId },
        category: AUTO_CLOCK_CATEGORIES.rest,
        at: rest.startAt,
      });
    }
    if (endAt) {
      await schedule({
        identifier: notificationIdFor('end', entryId),
        title: presence
          ? i18n.t('autoClock.push.presenceEndTitle', { count: presence.hours, place })
          : i18n.t('autoClock.push.endTitle', { time: formatTimeOfDay(shiftEnd, h12) }),
        body: presence
          ? i18n.t(presence.limit ? 'autoClock.push.presenceEndBodyLimit' : 'autoClock.push.presenceEndBody')
          : i18n.t('autoClock.push.endBody', { place }),
        // `presence` tells the button what "Still working" means: past a limit it asks for extra time; otherwise it just goes on.
        data: { kind: 'end', entryId, recipientId: userId, ...(presence ? { presence: true, limit: presence.limit } : {}) },
        category: AUTO_CLOCK_CATEGORIES.end,
        at: endAt,
      });
    }
  },

  async arrivedPrompt({ userId, spaceId, place, outsideHours }) {
    await i18nReady.catch(() => undefined);
    await schedule({
      identifier: notificationIdFor('arrived', spaceId),
      title: i18n.t('autoClock.push.arrivedTitle', { place }),
      body: i18n.t(outsideHours ? 'autoClock.push.arrivedOutsideBody' : 'autoClock.push.arrivedBody'),
      data: { kind: 'arrived', spaceId, recipientId: userId },
      at: null,
    });
  },

  async cancel(entryId, kinds = ALL_KINDS) {
    for (const kind of kinds) {
      const id = notificationIdFor(kind, entryId);
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
    }
  },
};

/**
 * The buttons, registered with the others (usePushNotifications). Registering
 * is idempotent and the OS keeps them, so a notification scheduled from the
 * background still shows its buttons.
 */
export async function registerAutoClockCategories(): Promise<void> {
  const open = { opensAppToForeground: true };
  // ⚠️ In turn, never `Promise.all`: each call rewrites iOS's whole category set (see usePushNotifications).
  const categories: Array<[string, Notifications.NotificationAction[]]> = [
    [AUTO_CLOCK_CATEGORIES.in, [
      { identifier: AUTO_CLOCK_ACTIONS.undo, buttonTitle: i18n.t('autoClock.push.undo'), options: { ...open, isDestructive: true } },
    ]],
    [AUTO_CLOCK_CATEGORIES.rest, [
      { identifier: AUTO_CLOCK_ACTIONS.skipRest, buttonTitle: i18n.t('autoClock.push.stillWorking'), options: open },
    ]],
    [AUTO_CLOCK_CATEGORIES.end, [
      { identifier: AUTO_CLOCK_ACTIONS.clockOut, buttonTitle: i18n.t('autoClock.push.clockOut'), options: open },
      { identifier: AUTO_CLOCK_ACTIONS.stillWorking, buttonTitle: i18n.t('autoClock.push.stillWorking'), options: open },
    ]],
  ];
  for (const [id, actions] of categories) {
    await Notifications.setNotificationCategoryAsync(id, actions).catch(() => undefined);
  }
}
