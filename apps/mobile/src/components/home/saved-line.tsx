import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { shadowGlass } from '../amazen/surfaces';

/** How long the line — and the undo behind it — stay. §5. */
export const UNDO_MS = 30_000;

/**
 * `( Saved to your account.                    UNDO )`
 *
 * ⚠️ THIS IS AN UNDO, NOT A CONFIRM, AND THE DIFFERENCE IS THE WHOLE DESIGN.
 * Nothing on this screen is destructive — a removed widget is hidden, not
 * deleted — so a dialog asking "are you sure?" turns the commonest action on
 * the screen into two taps to protect against something that cannot happen.
 * The change has already been saved by the time this appears.
 *
 * ❌ No save button either. **Done closes a mode; it does not commit
 * anything.** A member who backgrounds the app mid-arrangement keeps their
 * arrangement.
 */
export function SavedLine({
  visible,
  onUndo,
  bottom,
}: {
  visible: boolean;
  onUndo: () => void;
  /** Clear of the tab pill — `useTabSafe()`. */
  bottom: number;
}) {
  const { amazen, isDark } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  if (!visible) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 14, right: 14, bottom: bottom + 8 }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(3),
            backgroundColor: c.barFill,
            borderRadius: amazen.radius.full,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.lineWell,
            paddingVertical: amazen.space(2.5),
            paddingLeft: amazen.space(4),
            paddingRight: amazen.space(2),
          },
          shadowGlass(isDark),
        ]}
      >
        <AText variant="caption" tone="ink" numberOfLines={1} style={{ flex: 1 }}>
          {t('home.edit.saved', { defaultValue: 'Saved to your account.' })}
        </AText>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({
            paddingVertical: amazen.space(1.5),
            paddingHorizontal: amazen.space(3.5),
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentTint,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AText variant="caption" tone="accent" style={{ fontFamily: amazen.font.sansMedium }}>
            {t('common.undo', { defaultValue: 'UNDO' })}
          </AText>
        </Pressable>
      </View>
    </View>
  );
}
