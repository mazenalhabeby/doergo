import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View, type ListRenderItemInfo } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useResponsive } from '@/lib/responsive';
import { locationsApi } from '@/lib/api';
import type { MobileCustomerContact } from '@/lib/api/customers';
import { CLIENT_LOCALE_OPTIONS, clientLocaleFormValue } from '@/lib/client-locale';
import {
  AText,
  FilterPill,
  FilterRow,
  Ground,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Banner,
  SectionLabel,
  SheetOption,
} from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { JobSheet } from '@/features/job/job-ui';
import { ActivityRow, type PendingActivity } from '../activity-row';
import { ActivityComposer } from '../activity-composer';
import { ClientEditSheet } from '../client-edit-sheet';
import { AddContactSheet } from '../add-contact-sheet';
import { RecordHero } from './record-hero';
import { RecordAbout } from './record-about';
import { FILTERS, isWaiting, useClientRecord, type RecordTab } from './use-client-record';
import { localDateKey } from '@hbcfield/shared/client';
import { useRecordScreen } from './use-record-screen';
import { useRecordScreenLogic } from './use-record-screen-logic';
import { RecordScreenView } from './record-screen-view';

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
  const {
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
  } = useRecordScreenLogic({ id, linkedTab });

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

  const { top, pad, hidden } = RecordScreenView({ amazen, c, t, wide, m, record, askReminder });

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
          <ScrollView
            contentContainerStyle={pad}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refresher}>
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
                  {FILTERS.map((f) => (
                    <FilterPill
                      key={f.key}
                      label={t(f.label)}
                      on={m.filter === f.key}
                      onPress={() => m.setFilter(f.key)}
                    />
                  ))}
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
                {m.overdueCount > 0 ? (
                  <Banner tone="warn" text={t('customers.record.reminders.overdue', { count: m.overdueCount })} />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <AText variant="body" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(4) }}>
                {t('customers.record.reminders.none')}
              </AText>
            }
            ListFooterComponent={
              <View style={{ gap: amazen.space(3), paddingTop: amazen.space(3) }}>
                {m.canWork ? (
                  <PrimaryButton
                    label={`＋ ${t('customers.record.newReminder', 'New reminder')}`}
                    onPress={askReminder}
                  />
                ) : null}
                {m.doneReminders.length > 0 ? (
                  <Pressable
                    onPress={() => m.setShowDone((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: m.showDone }}
                    style={{ alignSelf: 'center', padding: amazen.space(2) }}>
                    <AText variant="body" tone="onGlass" style={{ fontSize: 13.5 }}>
                      {m.showDone
                        ? t('customers.record.reminders.hideDone')
                        : t('customers.record.reminders.showDone', { count: m.doneReminders.length })}
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
              <SheetOption
                label={t('customers.record.makePrimary')}
                onPress={() => {
                  const l = menu.link;
                  setMenu(null);
                  void m.makePrimary(l);
                }}
              />
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
            <SheetOption
              label={t('customers.record.removeContactConfirm')}
              tone="critical"
              onPress={() => {
                setMenu(null);
                void m.confirmRemove();
              }}
            />
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
