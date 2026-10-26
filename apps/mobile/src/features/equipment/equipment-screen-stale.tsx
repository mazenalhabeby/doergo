import { Pressable, View } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { router } from 'expo-router';
import { AText, Well, Banner, SectionLabel, SheetOption } from '@/components/amazen';
import { logFor } from './use-equipment-screen';
import type { EquipmentScreenState } from './use-equipment-screen-logic';
import { LoadingLine } from '@/components/loading-line';

/** Part of EquipmentScreen's markup, moved here unchanged; it reads the page's state from `vm`. */
export function EquipmentScreenStale({ vm }: { vm: EquipmentScreenState }) {
  const { amazen, stale, t, load, data, due, c, dueLine, held, card, offerContract, items } = vm;
  return (
    <View style={{ gap: amazen.space(3) }}>
      {stale ? (
        <Banner
          tone="warn"
          text={t('equipment.stale', 'Could not load just now — this is what the app last knew.')}
          action={{ label: t('common.retry', 'Try again'), onPress: () => void load(true) }}
        />
      ) : null}

      {data === null ? <LoadingLine onGlass padUnits={8} /> : null}

      {due.length > 0 ? (
        <>
          <SectionLabel
            tone="warn"
            style={{ paddingHorizontal: amazen.space(1) }}
          >{`${t('logbook.dueSoon', 'Due soon')} · ${due.length}`}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {due.map((d, i) => {
              const late = d.stage === 'overdue';
              return (
                <Pressable
                  key={`${d.assetId}:${d.key}`}
                  onPress={() => logFor(d.assetId, d.key)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    paddingVertical: amazen.space(3),
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: c.lineWell,
                    gap: 6,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AText
                        variant="body"
                        tone="strong"
                        numberOfLines={1}
                        style={{ fontSize: 14.5 }}
                      >{`${d.assetName} · ${d.label}`}</AText>
                      <AText variant="caption" numberOfLines={1} style={{ color: late ? c.critical : c.warn }}>
                        {dueLine(d)}
                      </AText>
                    </View>
                    <AText variant="body" tone="muted">
                      ›
                    </AText>
                  </View>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: c.tile, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.min(100, Math.max(4, Math.round(d.progress * 100)))}%`,
                        height: '100%',
                        borderRadius: 3,
                        backgroundColor: late ? c.critical : c.warn,
                      }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </Well>
        </>
      ) : null}

      {data && held.length === 0 && !stale ? (
        <View style={{ alignItems: 'center', paddingVertical: amazen.space(8), gap: amazen.space(2) }}>
          <Icon name="assets" size={36} color={c.inkOnGlass} />
          <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>
            {t('myAssets.empty', 'No equipment has been handed to you yet.')}
          </AText>
        </View>
      ) : null}
      {held.length > 0 ? (
        <SectionLabel
          style={{ paddingHorizontal: amazen.space(1) }}
        >{`${t('equipment.youHold', 'You hold')} · ${held.length}`}</SectionLabel>
      ) : null}
      {held.map(card)}

      {offerContract ? (
        <SheetOption
          label={t('documents.supply.contract', 'Contract for a vehicle or equipment')}
          hint={t('documents.supply.contractHint')}
          onPress={() => router.push('/(app)/send-document' as never)}
        />
      ) : null}
      {items.length > 0 ? (
        <SectionLabel
          style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2), paddingBottom: 0 }}
        >{`${t('equipment.sentIn', 'Sent in')} · ${items.length}`}</SectionLabel>
      ) : null}
    </View>
  );
}
