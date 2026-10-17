'use client';

import { Pressable, View } from 'react-native';
import { AText } from '../../amazen';
import { RecordHero } from './record-hero';
import { type RecordTab } from './use-client-record';
import type { useRecordScreenLogic } from './use-record-screen-logic';

/** What RecordScreen works out after its early returns, moved here unchanged; called from the same place. */
export function RecordScreenView({
  amazen,
  c,
  t,
  wide,
  m,
  record,
  askReminder,
}: {
  amazen: ReturnType<typeof useRecordScreenLogic>['amazen'];
  c: ReturnType<typeof useRecordScreenLogic>['c'];
  t: ReturnType<typeof useRecordScreenLogic>['t'];
  wide: ReturnType<typeof useRecordScreenLogic>['wide'];
  m: ReturnType<typeof useRecordScreenLogic>['m'];
  record: NonNullable<ReturnType<typeof useRecordScreenLogic>['record']>;
  askReminder: ReturnType<typeof useRecordScreenLogic>['askReminder'];
}) {
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
              style={{
                flex: 1,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 5,
                paddingVertical: amazen.space(2.25),
                borderRadius: amazen.radius.full,
                backgroundColor: on ? c.tile : 'transparent',
              }}>
              <AText variant="body" numberOfLines={1} style={{ fontSize: 13.5, color: on ? c.inkStrong : c.inkMuted }}>{tb.label}</AText>
              {tb.count ? (
                <AText
                  numeric
                  style={{ fontFamily: amazen.font.mono, fontSize: 10.5, color: tb.alert ? c.warn : c.accent }}
                >
                  {String(tb.count)}
                </AText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const pad = [{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide];
  const hidden = (k: RecordTab) => ({ flex: 1, display: m.tab === k ? 'flex' as const : 'none' as const });

  return { top, pad, hidden };
}
