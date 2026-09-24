import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText } from '../amazen';
import type { WidgetRow } from '../../home/registry';

/**
 * "Add to your home" — the way back for anything switched off.
 *
 * ⚠️ IT LISTS ONLY WHAT THIS PERSON COULD ACTUALLY HAVE. One
 * `availableWidgets(user)` feeds the home screen AND this list — asked once,
 * so the two cannot drift. Showing a widget somebody is not entitled to,
 * greyed out with a reason, is the same mistake as a menu entry whose only
 * outcome is a refusal: it advertises something that cannot happen and earns a
 * support ticket about permissions.
 *
 * The cost is that a widget disappearing when access changes is silent. That
 * is the accepted trade — §2.4 rule 2: a stored key that is no longer allowed
 * is skipped silently and never deleted.
 */
export function WidgetPicker({
  visible,
  onClose,
  offScreen,
  total,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  /** Available to this member, and switched off. */
  offScreen: WidgetRow[];
  /** How many they could have in total — for the sentence. */
  total: number;
  onAdd: (key: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <AText variant="h3" tone="strong">
          {t('home.arrange.addTitle', { defaultValue: 'Add to your home' })}
        </AText>
        <AText variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: 14 }}>
          {offScreen.length
            ? t('home.arrange.someOff', {
                count: offScreen.length,
                total,
                defaultValue: `${offScreen.length} of ${total} are off your home screen.`,
              })
            : t('home.arrange.allOn', {
                count: total,
                defaultValue: `All ${total} are on your home screen.`,
              })}
        </AText>

        {offScreen.length === 0 ? (
          <AText
            variant="caption"
            tone="muted"
            style={{ textAlign: 'center', paddingVertical: amazen.space(7) }}
          >
            {t('home.arrange.nothingToAdd', {
              defaultValue: 'Everything you can have is already here.',
            })}
          </AText>
        ) : (
          offScreen.map((w) => (
            <Pressable
              key={w.key}
              onPress={() => onAdd(w.key)}
              accessibilityRole="button"
              accessibilityLabel={t(w.title, { defaultValue: w.key })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: amazen.space(3),
                padding: amazen.space(3),
                borderRadius: amazen.radius.field,
                backgroundColor: c.tile,
                marginBottom: amazen.space(2),
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <AText variant="body" tone="strong" numberOfLines={1}>
                  {t(w.title, { defaultValue: w.key })}
                </AText>
                {w.question ? (
                  <AText variant="caption" tone="muted" numberOfLines={2}>
                    {w.question}
                  </AText>
                ) : null}
              </View>
              <AText variant="h3" tone="accent">＋</AText>
            </Pressable>
          ))
        )}
      </SheetPanel>
    </BlurSheet>
  );
}
