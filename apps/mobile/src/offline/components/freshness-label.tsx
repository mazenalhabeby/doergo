import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { COLORS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';
import { freshnessOf } from '../freshness';

/**
 * "Updated 07:31" beside a title, for a screen read from the phone.
 *
 * Quiet while recent. Past 12 hours it becomes an age and turns amber —
 * "Updated 14 h ago" — so an old list is recognisable as old without being
 * taken away. Renders nothing when the screen never came from the phone.
 */
export function FreshnessLabel({ at }: { at: number | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { formatTime } = useTimeFormat();
  // Re-read once a minute, so a screen left open ages on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const f = freshnessOf(at, now);
  if (f.kind === 'never') return null;
  const label =
    f.kind === 'at'
      ? t('offline.freshness.at', { time: formatTime(new Date(f.at), null) })
      : t(`offline.freshness.${f.unit}`, { count: f.value });
  return (
    <Text
      style={[s.text, f.stale ? { color: COLORS.warning, fontWeight: FONT_WEIGHT.semibold } : { color: colors.textMuted }]}
      numberOfLines={1}
      accessibilityLabel={label}
    >
      {label}
    </Text>
  );
}

const s = StyleSheet.create({
  text: { fontSize: FONT_SIZE.xs },
});
