import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../lib/constants';
import { usePendingFor } from '../offline-context';

/**
 * "Waiting to send" / "Not applied" on anything with work still on its way.
 *
 * Renders nothing in the normal case — a chip on every row would be noise, so
 * it only appears while this record has something the server has not accepted.
 */
export function SyncChip({ entityId }: { entityId: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { waiting, attention } = usePendingFor(entityId);
  if (!waiting && !attention) return null;

  const needsYou = attention > 0;
  return (
    <View
      style={[s.chip, { backgroundColor: needsYou ? colors.errorLight : colors.warningLight }]}
      accessibilityRole="text"
      accessibilityLabel={needsYou ? t('offline.chip.attention') : t('offline.chip.waiting')}
    >
      <Ionicons name={needsYou ? 'alert-circle' : 'cloud-upload-outline'} size={12} color={needsYou ? COLORS.error : COLORS.warning} />
      <Text style={[s.text, { color: needsYou ? COLORS.error : COLORS.warning }]} numberOfLines={1}>
        {needsYou ? t('offline.chip.attention') : t('offline.chip.waiting')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  text: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
});
