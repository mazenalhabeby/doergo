import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { AText } from '../../../components/amazen';
import type { refusedShiftCopy } from '../../../offline/attendance/refused-shift';

/**
 * A clock-in, clock-out or rest the server refused AFTER the card had shown
 * it done (see refused-shift.ts) — said on the card until the member deals
 * with it: tell the office, or dismiss.
 */
export function RefusedShiftBanner({ copy: refusedCopy, onTellOffice, onDismiss }: {
  copy: NonNullable<ReturnType<typeof refusedShiftCopy>>;
  onTellOffice: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginTop: amazen.space(4),
        backgroundColor: c.criticalTint,
        borderRadius: amazen.radius.field,
        padding: amazen.space(3.5),
        gap: amazen.space(1.5),
      }}
    >
      <AText variant="body" style={{ color: c.critical, fontFamily: amazen.font.sansMedium }}>{refusedCopy.title}</AText>
      <AText variant="caption" tone="ink" style={{ lineHeight: 18 }}>{refusedCopy.reason}</AText>
      <View style={{ flexDirection: 'row', gap: amazen.space(5), marginTop: amazen.space(1) }}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onTellOffice}
        >
          <AText variant="caption" style={{ color: c.critical, fontFamily: amazen.font.sansMedium }}>
            {t('shiftClock.refused.tellOffice', { defaultValue: 'Tell my office' })}
          </AText>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onDismiss}>
          <AText variant="caption" tone="onGlass">{t('shiftClock.refused.dismiss', { defaultValue: 'Dismiss' })}</AText>
        </Pressable>
      </View>
    </View>
  );
}
