import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { COLORS, type ThemeColors } from '../../lib/constants';
import { useTheme } from '../../contexts/theme-context';

/**
 * Mine, or everything I oversee.
 *
 * Only shown to somebody who can see more than their own work — for a field
 * member the list already IS their own, and a scope with one real option is
 * furniture.
 *
 * ⚠️ Both counts are always visible, including the one you are not looking at.
 * An admin lives in "All", and the point of this control is that their own job
 * cannot go unnoticed there; a badge you have to switch scope to discover would
 * defeat it. The numbers come from the server's counts endpoint, because the
 * list is paged and anything counted here would be a count of the page.
 *
 * ⚠️ Every surface colour comes from `useTheme`, not from the static COLORS
 * palette. The two are not interchangeable: COLORS.slate100 is a fixed light
 * grey, so a control built from it renders as a white panel on a dark screen —
 * which is exactly what this did on first build. Only the BRAND green, which is
 * the same in both themes, is taken from COLORS.
 */
export function WorkScope({
  mine,
  onChange,
  mineCount,
  allCount,
}: {
  mine: boolean;
  onChange: (mine: boolean) => void;
  mineCount: number | null;
  allCount: number | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  const option = (isMine: boolean, label: string, count: number | null) => {
    const active = mine === isMine;
    return (
      <TouchableOpacity
        key={label}
        style={[s.opt, active && s.optOn]}
        onPress={() => onChange(isMine)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={count == null ? label : `${label}, ${count}`}
      >
        <Text style={[s.label, active && s.labelOn]} numberOfLines={1}>
          {label}
        </Text>
        {count != null && (
          <View style={[s.badge, active && s.badgeOn]}>
            <Text style={[s.badgeText, active && s.badgeTextOn]}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.wrap} accessibilityRole="tablist">
      {option(true, t('tasks.myWork.scope.mine'), mineCount)}
      {option(false, t('tasks.myWork.scope.all'), allCount)}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: 4,
      // The recessed track the segments sit in — `input` is the token this app
      // uses for exactly that, and it darkens with the theme.
      backgroundColor: c.input,
      borderRadius: 11,
      padding: 4,
    },
    opt: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    // The brand green reads on both themes and is the app's selected state
    // everywhere else, so it is the one colour taken from the static palette.
    optOn: { backgroundColor: COLORS.primary },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    labelOn: { color: COLORS.white },
    badge: {
      minWidth: 20,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: c.surfaceRaised,
      alignItems: 'center',
    },
    badgeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    badgeTextOn: { color: COLORS.white },
  });
