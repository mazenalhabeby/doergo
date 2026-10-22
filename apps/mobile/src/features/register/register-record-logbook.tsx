import { ScrollView, View } from 'react-native';
import { findLogType, logValueLines, personName } from '@hbcfield/shared/client';
import { formatDay } from '@/lib/money';
import { AText, GhostButton, SectionLabel } from '@/components/amazen';
import { StatusDot, WellRow } from './well-row';
import { statusLabel } from './register-words';
import type { RegisterRecordState } from './use-register-record';
import type { RegisterRecordView } from './register-record-view';

/** Part of RegisterRecord's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RegisterRecordLogbook({
  vm,
  facts,
  entryState,
  entryValue,
}: {
  vm: RegisterRecordState;
  facts: ReturnType<typeof RegisterRecordView>['facts'];
  entryState: ReturnType<typeof RegisterRecordView>['entryState'];
  entryValue: ReturnType<typeof RegisterRecordView>['entryValue'];
}) {
  const {
    amazen,
    wide,
    asset,
    t,
    c,
    entries,
    shape,
    lang,
    cursor,
    moreBusy,
    more,
    missing,
  } = vm;
  if ((missing)) return null;
  if ((!asset)) return null;
  return (
    <ScrollView
      contentContainerStyle={[
        { paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(30), gap: amazen.space(3) },
        wide,
      ]}>
      <View style={{ gap: amazen.space(1.5) }}>
        <AText variant="h2" tone="strong">{asset.name}</AText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <StatusDot status={asset.status} />
          <AText variant="caption" tone="onGlass">{statusLabel(t, asset.status)}</AText>
        </View>
      </View>

      <View
        style={{
          backgroundColor: c.well,
          borderRadius: amazen.radius.panel,
          paddingHorizontal: amazen.space(3.5),
          paddingVertical: amazen.space(1.5),
        }}>
        {facts.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: amazen.space(3),
              paddingVertical: amazen.space(2.25),
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.lineWell,
            }}>
            <AText variant="caption" style={{ color: c.inkMuted, fontSize: 13 }}>{k}</AText>
            <AText
              variant="body"
              tone="strong"
              numberOfLines={2}
              style={{ fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}
            >
              {v}
            </AText>
          </View>
        ))}
      </View>

      <SectionLabel>{t('register.logbook', 'Logbook')}</SectionLabel>
      {entries.length === 0 ? (
        <AText variant="body" tone="onGlass">{t('register.logEmpty', 'Nothing logged yet.')}</AText>
      ) : (
        <View>
          {entries.map((e, i) => (
            <WellRow
              key={e.id}
              first={i === 0}
              last={i === entries.length - 1}
              leading={<View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent }} />}
              title={e.category}
              detail={[
                ...logValueLines(e, findLogType(shape, e.logType), (n) => n.toLocaleString(lang)),
                e.author ? personName(e.author) : null,
                formatDay(e.occurredAt, lang),
                e.note,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                entryState(e) ??
                (entryValue(e) ? (
                  <AText numeric variant="caption" tone="strong">
                    {entryValue(e)}
                  </AText>
                ) : (
                  <View />
                ))
              }
              onPress={() => undefined}
            />
          ))}
        </View>
      )}
      {cursor ? <GhostButton label={moreBusy ? '…' : t('register.olderEntries', 'Older entries')} onPress={() => void more()} /> : null}
    </ScrollView>
  );
}
