import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, type ListRenderItemInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { useToast } from '../../../island/island-context';
import { useResponsive } from '../../../lib/responsive';
import { locationsApi } from '../../../lib/api';
import type { MobileCustomerContact } from '../../../lib/api/customers';
import { centeredContent } from '../../screen-container';
import { SectionLabel } from '../../job/job-ui';
import { ActivityRow, type PendingActivity } from '../activity-row';
import { useClientRecord } from './use-client-record';
import { localDateKey } from '@hbcfield/shared/client';

export type FeedItem = { kind: 'day'; key: string; label: string } | { kind: 'act'; key: string; a: PendingActivity; continues: boolean };

/** The local day an entry belongs to, as a stable key. */
export const dayKey = (iso: string) => localDateKey(iso);

/** RecordScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRecordScreen({ id, linkedTab }: Pick<{ id: string; linkedTab?: string }, 'id' | 'linkedTab'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const m = useClientRecord(id, linkedTab);
  const record = m.record;

  /* The workspace's NAME — the record carries only its id. */
  const [spaceName, setSpaceName] = useState<string | null>(null);
  useEffect(() => {
    if (!record?.spaceId) { setSpaceName(null); return; }
    let live = true;
    locationsApi.list().then((rows) => { if (live) setSpaceName(rows.find((x) => x.id === record.spaceId)?.name ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, [record?.spaceId]);

  /* Remind / New reminder: open Activity with the composer on Reminder. */
  const [reminderRequest, setReminderRequest] = useState(0);
  const askReminder = useCallback(() => { m.selectTab('activity'); setReminderRequest((n) => n + 1); }, [m]);

  /* The contact sheet — its acts, then the confirm, in ONE sheet (two modals at once freeze iOS). */
  const [menu, setMenu] = useState<{ link: MobileCustomerContact; step: 'menu' | 'confirm' } | null>(null);
  const openMore = useCallback((link: MobileCustomerContact) => setMenu({ link, step: 'menu' }), []);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/customers' as Href));
  const refresher = <RefreshControl refreshing={m.refreshing} onRefresh={m.onRefresh} tintColor={c.accent} colors={[c.accent]} />;

  /* ---------- the feed, grouped by day ---------- */
  const dayLabel = useCallback((iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (dayKey(iso) === dayKey(today.toISOString())) return t('customers.record.today', 'Today');
    if (dayKey(iso) === dayKey(yesterday.toISOString())) return t('customers.record.yesterday', 'Yesterday');
    return d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }, [t, i18n.language]);

  const feedItems = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    let last = '';
    m.feed.forEach((a, i) => {
      const k = dayKey(a.createdAt);
      if (k !== last) { out.push({ kind: 'day', key: `day-${k}`, label: dayLabel(a.createdAt) }); last = k; }
      const next = m.feed[i + 1];
      out.push({ kind: 'act', key: a.id, a, continues: !!next && dayKey(next.createdAt) === k });
    });
    return out;
  }, [m.feed, dayLabel]);

  const doneLabel = useCallback((a: PendingActivity) => (
    a.type !== 'REMINDER' ? undefined
      : a.doneAt ? t('customers.record.reminderDone')
      : a.dueAt ? t('customers.record.reminderDue', { date: new Date(a.dueAt).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
      : t('customers.record.composer.reminder')
  ), [t, i18n.language]);

  const renderActivity = useCallback((a: PendingActivity, continues: boolean) => (
    <ActivityRow
      activity={a}
      continues={continues}
      heading={m.headingFor(a)}
      tags={m.tagsFor(a)}
      meta={[a.author?.firstName, a.pendingSync ? '' : m.relTime(a.createdAt)].filter(Boolean).join(' · ')}
      waiting={a.pendingSync ? t('offline.chip.waiting') : undefined}
      onToggleDone={m.toggleDone}
      doneLabel={doneLabel(a)}
    />
  ), [m, t, doneLabel]);

  const renderFeed = useCallback(({ item }: ListRenderItemInfo<FeedItem>) => (
    item.kind === 'day'
      ? <SectionLabel style={{ paddingTop: amazen.space(3), paddingBottom: amazen.space(2) }}>{item.label}</SectionLabel>
      : renderActivity(item.a, item.continues)
  ), [renderActivity, amazen]);

  const renderReminder = useCallback(({ item, index }: ListRenderItemInfo<PendingActivity>) => (
    <>
      {m.showDone && index === m.openReminders.length && index > 0 ? (
        <SectionLabel style={{ paddingTop: amazen.space(2), paddingBottom: amazen.space(2) }}>{t('customers.record.reminders.done')}</SectionLabel>
      ) : null}
      {renderActivity(item, index < m.reminderRows.length - 1 && index !== m.openReminders.length - 1)}
    </>
  ), [m.showDone, m.openReminders.length, m.reminderRows.length, renderActivity, t, amazen]);

  return {
    amazen,
    c,
    t,
    toast,
    wide,
    m,
    record,
    spaceName,
    reminderRequest,
    askReminder,
    menu,
    setMenu,
    openMore,
    back,
    refresher,
    feedItems,
    renderFeed,
    renderReminder,
  };
}
