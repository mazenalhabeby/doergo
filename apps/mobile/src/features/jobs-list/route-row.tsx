import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';
import { NavigateGlyph } from '../../components/glyphs';

/**
 * "Plan my route" — `.route`. Offered only to somebody who drives, with stops
 * to drive to (`showsRouteRow`). The count is the one fact that makes the row
 * worth its height: two stops is a detour, nine is the morning.
 */
export function RouteRow({ stops, onPress }: { stops: number; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('route.planRouteA11y', { count: stops })}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
        backgroundColor: c.well, borderRadius: 22, paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: c.accentTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <NavigateGlyph size={18} color={c.accent} contrast={c.well} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText
          variant="body"
          tone="strong"
          numberOfLines={1}
          style={{ fontFamily: amazen.font.sansMedium, fontSize: 16, lineHeight: 22 }}
        >
          {t('route.planRoute')}
        </AText>
        <AText variant="caption" tone="ink" numberOfLines={1}>{t('route.stopCount', { count: stops })}</AText>
      </View>
      <AText variant="body" tone="ink">›</AText>
    </Pressable>
  );
}
