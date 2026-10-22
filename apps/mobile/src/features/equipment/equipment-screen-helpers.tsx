import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { canTakeBack, type SentItem } from '../../lib/sent-in';
import { AText } from '../../components/amazen';

/** EquipmentScreen's module-level helpers, moved here unchanged so its sections can read them too. */

/**
 * One thing sent in — its slice of the "Sent in" well. Memoised on what it
 * shows: the strings are worked out by the screen, so a row redraws only when
 * its own words change.
 */
export const SentRow = memo(function SentRow({ item: i, first, last, what, stateText, dayText, amountText, onTakeBack, takeBackLabel }: {
  item: SentItem;
  first: boolean;
  last: boolean;
  what: string;
  stateText: string;
  dayText: string;
  amountText: string | null;
  onTakeBack: (i: SentItem) => void;
  takeBackLabel: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const radius = amazen.radius.panel;
  const tone =
    i.state === 'toSend' || i.state === 'office'
      ? c.warn
      : i.state === 'refused'
        ? c.critical
        : i.state === 'accepted'
          ? c.accent
          : c.inkMuted;
  const lead = [dayText, i.reading].filter(Boolean).join(' · ');
  return (
    <View
      style={{
        backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
        ...(first ? { borderTopLeftRadius: radius, borderTopRightRadius: radius, marginTop: amazen.space(3) } : null),
        ...(last ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          paddingVertical: amazen.space(2.75),
          borderTopWidth: first ? 0 : 1,
          borderTopColor: c.lineWell,
        }}>
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons
            name={
              i.kind === 'contract'
                ? 'document-text-outline'
                : i.state === 'toSend'
                  ? 'cloud-upload-outline'
                  : 'receipt-outline'
            }
            size={16}
            color={c.ink}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>
            {[what, i.about].filter(Boolean).join(' · ')}
          </AText>
          <AText variant="caption" numberOfLines={2} style={{ color: c.inkMuted }}>
            {`${lead} · `}
            <AText variant="caption" style={{ color: tone }}>{stateText}</AText>
            {i.reason ? <AText variant="caption" tone="muted">{` — “${i.reason}”`}</AText> : null}
          </AText>
          {canTakeBack(i) ? (
            <Pressable
              onPress={() => onTakeBack(i)}
              hitSlop={8}
              accessibilityRole="button"
              style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <AText variant="caption" style={{ color: c.critical }}>{takeBackLabel}</AText>
            </Pressable>
          ) : null}
        </View>
        {amountText ? (
          <AText
            numeric
            style={{
              fontSize: 14,
              color:
                i.state === 'refused' || i.state === 'takenBack'
                  ? c.inkMuted
                  : i.direction === 'IN'
                    ? c.accent
                    : c.inkStrong,
            }}>
            {`${i.direction === 'IN' ? '+' : ''}${amountText}`}
          </AText>
        ) : null}
      </View>
    </View>
  );
});
