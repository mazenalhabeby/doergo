import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useResponsive } from '../../lib/responsive';
import { formatTimeOfDay } from '../../lib/utils';
import { refusalInterpolation } from '../../lib/distance';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well, Pill, SectionLabel } from '../../components/amazen';
import { centeredContent } from '../../components/screen-container';
import { StateCard, SwitchRow } from './settings-ui';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useToast } from '../../island/island-context';
import { refusedSpaceId } from '../../offline/attendance/refused-shift';
import { ReportIssueSheet } from '../time/shift-issue-sheet';
import { formatFileSize } from '@hbcfield/shared/client';
import { useSyncPage } from './use-sync-page';
import { STORAGE_WARN_BYTES, STORAGE_URGENT_BYTES, OpSection, OpRow, SmallButton } from './sync-page-helpers';

/**
 * SYNC — "is my work on the server?", answered in the first line.
 *
 * Then what needs the member (retry or let go, with the reason), what is
 * simply waiting, what went today, and this phone's own settings. "Sync now"
 * sits under the answer; it used to be at the very bottom, under the storage
 * figures, where nobody who needed it looked.
 */
export function SyncPage() {
  const {
    amazen,
    c,
    t,
    formatBytes,
    wide,
    engine,
    preferences,
    unavailableReason,
    unavailableDetail,
    available,
    online,
    refreshing,
    appVersion,
    jsBuild,
    groups,
    wifiOnly,
    storage,
    refresh,
    label,
    reason,
    time,
    report,
    setReport,
    shiftCopy,
    waitingWhy,
    removeWaiting,
    need,
    waiting,
    head,
    back,
    row,
  } = useSyncPage();

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('offline.sync.title', 'Sync')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={
          available ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />
          ) : undefined
        }
      >
        {!available ? (
          <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(4), gap: amazen.space(2) }}>
            {/* Why, not only that: "update the app" answers one of these and would send the other to a store with nothing for them. */}
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {unavailableReason === 'failed' || unavailableReason === 'no-org'
                ? t('offline.sync.unavailableFailed')
                : t('offline.sync.unavailable', { version: appVersion })}
            </AText>
            {/* Not translated: read by whoever is sent the screenshot, not by the member. */}
            {unavailableDetail ? (
              <AText
                variant="caption"
                tone="muted"
                selectable
              >{`${appVersion} · js ${jsBuild} · ${unavailableDetail}`}</AText>
            ) : null}
          </View>
        ) : (
          <>
            <StateCard tone={head.tone} mark={head.tone === 'accent' ? undefined : head.mark} title={head.title} sub={head.sub} />
            {online ? (
              <PrimaryButton
                label={t('offline.sync.syncNow', 'Sync now')}
                loading={refreshing}
                onPress={() => void refresh()}
              />
            ) : null}

            {need ? (
              <OpSection tone="critical" title={`${t('offline.sync.attention')} · ${need}`}>
                {groups.attention.map((o, i) => {
                  const shiftWords = shiftCopy(o);
                  return (
                    <OpRow
                      key={o.id}
                      first={i === 0}
                      title={label(o)}
                      aside={
                        <AText variant="caption" tone="muted" numeric>
                          {time(o.createdAt)}
                        </AText>
                      }>
                      <AText variant="caption" style={{ color: c.critical, lineHeight: 18 }}>{shiftWords?.reason ?? reason(o)}</AText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2), marginTop: 6 }}>
                        {shiftWords ? (
                          <>
                            {shiftWords.canClockInNow ? (
                              <SmallButton
                                accent
                                label={t('shiftClock.refused.clockInNow', 'Clock in now')}
                                onPress={() => router.navigate('/(app)/(tabs)' as Href)}
                              />
                            ) : null}
                            <SmallButton
                              label={t('shiftClock.refused.tellOffice', 'Tell my office')}
                              onPress={() =>
                                setReport({
                                  opId: o.id,
                                  title: shiftWords.issueTitle,
                                  body: shiftWords.issueBody,
                                  spaceId: refusedSpaceId(o),
                                })
                              }
                            />
                          </>
                        ) : o.state === 'failed' ? <SmallButton label={t('offline.sync.retry')} onPress={() => void engine?.retry(o.id)} /> : null}
                        <SmallButton
                          label={o.state === 'conflict' ? t('offline.sync.gotIt') : shiftWords ? t('settings.sync.remove', 'Remove') : t('offline.sync.discard')}
                          critical={o.state !== 'conflict'}
                          onPress={() => void engine?.discard(o.id)}
                        />
                      </View>
                    </OpRow>
                  );
                })}
              </OpSection>
            ) : null}

            {waiting ? (
              <OpSection tone="warn" title={`${t('offline.sync.waiting')} · ${waiting}`}>
                {groups.waiting.map((o, i) => {
                  const wifi = o.lastError?.code === 'WAITING_FOR_WIFI';
                  const why = waitingWhy(o);
                  const removable = o.state === 'pending' || o.state === 'retry' || o.state === 'held';
                  return (
                    <OpRow
                      key={o.id}
                      first={i === 0}
                      centered
                      title={label(o)}
                      aside={<Pill label={wifi ? 'Wi-Fi' : t('offline.chip.waiting')} tone="warn" />}>
                      <AText variant="caption" tone="muted">
                        {t('offline.sync.waitingSince', { time: time(o.createdAt) })}
                        {why ? ` · ${why}` : ''}
                      </AText>
                      {o.state === 'retry' || removable ? (
                        <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: 6 }}>
                          {o.state === 'retry' && online ? (
                            <SmallButton label={t('settings.sync.tryNow', 'Try now')} onPress={() => void refresh()} />
                          ) : null}
                          {removable ? (
                            <SmallButton
                              critical
                              label={t('settings.sync.remove', 'Remove')}
                              onPress={() => void removeWaiting(o)}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </OpRow>
                  );
                })}
              </OpSection>
            ) : null}

            {groups.sent.length ? (
              <OpSection title={`${t('settings.sync.sentToday', 'Sent today')} · ${groups.sent.length}`}>
                {groups.sent.slice(0, 20).map((o, i) =>
                  row(
                    o,
                    i,
                    <AText variant="caption" tone="muted" numeric>
                      {time(o.createdAt)}
                    </AText>,
                  ),
                )}
              </OpSection>
            ) : null}

            <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>
              {t('offline.sync.thisPhone')}
            </SectionLabel>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              <SwitchRow
                first
                title={t('offline.sync.wifiOnly')}
                sub={t('offline.sync.wifiOnlyHint')}
                value={wifiOnly}
                onChange={(v) => void preferences?.set({ photosOnWifiOnly: v })}
              />
              {[
                [
                  t('offline.sync.photosWaiting'),
                  t('offline.sync.photosWaitingValue', {
                    count: storage.waitingCount,
                    size: formatBytes(storage.waitingBytes),
                  }),
                ],
                [t('offline.sync.keptOffline'), formatBytes(storage.keptBytes)],
              ].map(([k, v]) => (
                <View
                  key={k}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingVertical: amazen.space(3),
                    borderTopWidth: 1,
                    borderTopColor: c.lineWell,
                  }}>
                  <AText variant="body" tone="muted" style={{ fontSize: 13.5, flexShrink: 1 }}>{k}</AText>
                  <AText variant="body" tone="strong" numeric style={{ fontSize: 13.5 }}>{v}</AText>
                </View>
              ))}
              {storage.waitingBytes > STORAGE_WARN_BYTES ? (
                <AText variant="caption" style={{ color: c.warn, paddingBottom: amazen.space(3) }}>
                  {t(
                    storage.waitingBytes > STORAGE_URGENT_BYTES
                      ? 'offline.sync.storageUrgent'
                      : 'offline.sync.storageWarning',
                    { size: formatBytes(storage.waitingBytes) },
                  )}
                </AText>
              ) : null}
            </Well>
          </>
        )}
      </ScrollView>
      <ReportIssueSheet
        visible={!!report}
        onClose={() => setReport(null)}
        spaceId={report?.spaceId}
        initialTitle={report?.title}
        initialDescription={report?.body}
        onCreated={(id) => {
          if (report) void engine?.discard(report.opId);
          setReport(null);
          router.navigate({ pathname: '/(app)/(tabs)/attendance', params: { issueId: id } } as unknown as Href);
        }}
      />
    </Ground>
  );
}
