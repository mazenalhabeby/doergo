import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View, type ListRenderItemInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { useToast } from '../../../island/island-context';
import { useResponsive } from '../../../lib/responsive';
import { locationsApi } from '../../../lib/api';
import type { MobileCustomerContact } from '../../../lib/api/customers';
import { CLIENT_LOCALE_OPTIONS, clientLocaleFormValue } from '../../../lib/client-locale';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, PrimaryButton, ScreenHeader } from '../../amazen';
import { centeredContent } from '../../screen-container';
import { Banner, JobSheet, SectionLabel, SheetOption } from '../../job/job-ui';
import { ActivityRow, type PendingActivity } from '../activity-row';
import { ActivityComposer } from '../activity-composer';
import { ClientEditSheet } from '../client-edit-sheet';
import { AddContactSheet } from '../add-contact-sheet';
import { RecordHero } from './record-hero';
import { RecordAbout } from './record-about';
import { FILTERS, isWaiting, useClientRecord, type RecordTab } from './use-client-record';
import { localDateKey } from '@hbcfield/shared/client';

type FeedItem = { kind: 'day'; key: string; label: string } | { kind: 'act'; key: string; a: PendingActivity; continues: boolean };

/** The local day an entry belongs to, as a stable key. */
const dayKey = (iso: string) => localDateKey(iso);

/**
 * THE CLIENT RECORD — who they are and the four acts on top, then About,
 * Activity and Reminders.
 *
 * The data and every write are `useClientRecord`'s; this file only draws.
 *
 * ⚠️ A tab is mounted the first time it is asked for and then KEPT, hidden,
 * so each keeps its scroll and nothing re-runs on the way back. The top card
 * is part of each tab's scroll rather than pinned — on a phone the list needs
 * the height, and the card has been read by the time somebody scrolls.
 */
export function RecordScreen({ id, linkedTab }: { id: string; linkedTab?: string }) {
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

  if (m.loading || !record) {
    return (
      <Ground style={{ flex: 1 }}>
        <ScreenHeader title={t('customers.record.title', 'Client')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: amazen.space(8) }}>
          {m.loading
            ? <ActivityIndicator color={c.accent} />
            : <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>{t('customers.record.notFound')}</AText>}
        </View>
      </Ground>
    );
  }

  const tabs: { key: RecordTab; label: string; count?: number; alert?: boolean }[] = [
    { key: 'information', label: t('customers.record.tabs.information') },
    { key: 'activity', label: t('customers.record.tabs.activity') },
    { key: 'reminders', label: t('customers.record.tabs.reminders'), count: m.openReminders.length, alert: m.overdueCount > 0 },
  ];

  /* The top of every tab: the card, and the tab switch under it. */
  const top = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
      <RecordHero record={record} canWork={m.canWork} onStage={(k) => void m.setStage(k)} onRemind={askReminder} />
      <View style={{ flexDirection: 'row', backgroundColor: c.sunken, borderRadius: amazen.radius.full, padding: 4 }}>
        {tabs.map((tb) => {
          const on = m.tab === tb.key;
          return (
            <Pressable key={tb.key} onPress={() => m.selectTab(tb.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingVertical: amazen.space(2.25), borderRadius: amazen.radius.full, backgroundColor: on ? c.tile : 'transparent' }}>
              <AText variant="body" numberOfLines={1} style={{ fontSize: 13.5, color: on ? c.inkStrong : c.inkMuted }}>{tb.label}</AText>
              {tb.count ? <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 10.5, color: tb.alert ? c.warn : c.accent }}>{String(tb.count)}</AText> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const pad = [{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide];
  const hidden = (k: RecordTab) => ({ flex: 1, display: m.tab === k ? 'flex' as const : 'none' as const });

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('customers.record.title', 'Client')}
        leading={<HeaderBack onPress={back} />}
        actions={m.canEditInfo ? [{ label: t('customers.record.edit'), onPress: () => m.setEditing(true) }] : undefined}
        style={wide ?? undefined}
      />

      {m.seen.information ? (
        <View style={hidden('information')}>
          <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={refresher}>
            {top}
            <RecordAbout model={m} spaceName={spaceName} onMore={openMore} onLanguage={() => m.setLocaleOpen(true)} />
          </ScrollView>
        </View>
      ) : null}

      {m.seen.activity ? (
        <View style={hidden('activity')}>
          {/*
            ⚠️ A FlatList: a client with two hundred calls mounts the handful on
            screen. `ListHeaderComponent` gets an ELEMENT and the composer is a
            module-scope component, or the note being typed loses focus per letter.
          */}
          <FlatList
            data={feedItems}
            keyExtractor={(x) => x.key}
            renderItem={renderFeed}
            contentContainerStyle={pad}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refresher}
            removeClippedSubviews={false}
            ListHeaderComponent={
              <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(1) }}>
                {top}
                <ActivityComposer
                  onSubmit={m.addActivity}
                  onCreateTask={record.spaceId ? m.openTask : undefined}
                  assignees={m.assignees}
                  reminderRequest={reminderRequest}
                />
                <FilterRow>
                  {FILTERS.map((f) => <FilterPill key={f.key} label={t(f.label)} on={m.filter === f.key} onPress={() => m.setFilter(f.key)} />)}
                </FilterRow>
              </View>
            }
            ListEmptyComponent={
              <AText variant="body" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>
                {m.filter === 'all' ? t('customers.record.noActivity') : t('customers.record.noActivityFiltered')}
              </AText>
            }
          />
        </View>
      ) : null}

      {m.seen.reminders ? (
        <View style={hidden('reminders')}>
          <FlatList
            data={m.reminderRows}
            keyExtractor={(a) => a.id}
            renderItem={renderReminder}
            contentContainerStyle={pad}
            showsVerticalScrollIndicator={false}
            refreshControl={refresher}
            removeClippedSubviews={false}
            ListHeaderComponent={
              <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(3) }}>
                {top}
                {m.overdueCount > 0 ? <Banner tone="warn" text={t('customers.record.reminders.overdue', { count: m.overdueCount })} /> : null}
              </View>
            }
            ListEmptyComponent={
              <AText variant="body" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(4) }}>{t('customers.record.reminders.none')}</AText>
            }
            ListFooterComponent={
              <View style={{ gap: amazen.space(3), paddingTop: amazen.space(3) }}>
                {m.canWork ? <PrimaryButton label={`＋ ${t('customers.record.newReminder', 'New reminder')}`} onPress={askReminder} /> : null}
                {m.doneReminders.length > 0 ? (
                  <Pressable onPress={() => m.setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: m.showDone }} style={{ alignSelf: 'center', padding: amazen.space(2) }}>
                    <AText variant="body" tone="onGlass" style={{ fontSize: 13.5 }}>
                      {m.showDone ? t('customers.record.reminders.hideDone') : t('customers.record.reminders.showDone', { count: m.doneReminders.length })}
                    </AText>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        </View>
      ) : null}

      {m.canEditInfo ? (
        <ClientEditSheet
          visible={m.editing}
          customer={record}
          onClose={() => m.setEditing(false)}
          /* Hands back WHAT CHANGED — queued, the overlay already shows it; accepted, the fields are the server's now. */
          onSaved={(patch, queued) => {
            if (queued) { toast.success(t('offline.savedForLater')); return; }
            m.setCustomer((x) => (x ? { ...x, ...patch } : x));
            void m.refreshActivities();
          }}
        />
      ) : null}

      {m.canEditInfo ? (
        <AddContactSheet
          visible={m.adding !== null}
          recordId={id}
          side={m.adding ?? 'person'}
          onClose={() => m.setAdding(null)}
          /* Both sides RE-READ; neither appends the answer — see the hook. */
          onAdded={(queued) => {
            if (queued) { toast.success(t('offline.savedForLater')); return; }
            if (m.adding === 'company') void m.refreshCompanies();
            else void m.refreshContacts();
          }}
        />
      ) : null}

      <JobSheet
        visible={!!menu}
        onClose={() => { setMenu(null); m.setRemoving(null); }}
        title={menu ? (menu.step === 'confirm' ? t('customers.record.removeContact') : (menu.link.person?.name ?? menu.link.company?.name ?? '')) : ''}
      >
        {menu?.step === 'menu' ? (
          <>
            {/* The star is offered only where this record is the company, and only on a link the server has minted. */}
            {menu.link.person && !menu.link.isPrimary && !isWaiting(menu.link as never) ? (
              <SheetOption label={t('customers.record.makePrimary')} onPress={() => { const l = menu.link; setMenu(null); void m.makePrimary(l); }} />
            ) : null}
            <SheetOption
              label={t('customers.record.removeContact')}
              tone="critical"
              onPress={() => { m.setRemoving(menu.link as never); setMenu({ link: menu.link, step: 'confirm' }); }}
            />
          </>
        ) : menu ? (
          <>
            {/* Says what it does NOT do: the person's own record is kept. An unsent row is called back instead. */}
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {(menu.link as { opId?: string }).opId
                ? t('customers.record.removeContactPendingBody', { name: menu.link.person?.name ?? menu.link.company?.name ?? '' })
                : t('customers.record.removeContactBody', { name: menu.link.person?.name ?? menu.link.company?.name ?? '' })}
            </AText>
            <SheetOption label={t('customers.record.removeContactConfirm')} tone="critical" onPress={() => { setMenu(null); void m.confirmRemove(); }} />
            <SheetOption label={t('common.cancel', 'Cancel')} onPress={() => { setMenu(null); m.setRemoving(null); }} />
          </>
        ) : null}
      </JobSheet>

      <JobSheet visible={m.localeOpen} onClose={() => m.setLocaleOpen(false)} title={t('customers.locale')}>
        <AText variant="caption" tone="muted" style={{ lineHeight: 17 }}>{t('customers.localeHint')}</AText>
        {[{ value: '', label: t('customers.localeSame') }, ...CLIENT_LOCALE_OPTIONS].map((o) => (
          <SheetOption
            key={o.value || 'same'}
            label={`${clientLocaleFormValue(record) === o.value ? '✓  ' : ''}${o.label}`}
            tone={clientLocaleFormValue(record) === o.value ? 'accent' : 'strong'}
            onPress={() => void m.setLocale(o.value)}
          />
        ))}
      </JobSheet>
    </Ground>
  );
}
