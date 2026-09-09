import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { COLORS, type ThemeColors } from '../../lib/constants';
import { useTheme } from '../../contexts/theme-context';
import { daysLate, workBand, type WorkItem } from '@hbcfield/shared/client';

/**
 * The one to open, and why it is that one.
 *
 * A person unlocking their phone wants an answer, not a ranking. So the top of
 * their own list names a single job and says what makes it next — "you are en
 * route, it was due yesterday" — because a reason can be checked and a position
 * in a list cannot.
 *
 * The ordering itself is `rankMyWork` in shared; this only renders its first
 * result. Nothing about "which is next" is decided here, so the card and the
 * list beneath it can never disagree.
 *
 * ⚠️ Surfaces come from `useTheme`, not from the static COLORS palette.
 * `primaryLight` exists in BOTH and they are different colours — #ecfdf5 in the
 * light theme and #0a2a20 in the dark one — so reaching for the static version
 * paints a mint card with near-black text onto a dark screen. It did, on first
 * build. The brand green is the one thing taken from COLORS, because it is the
 * same in both themes.
 */
export function NextUpCard({
  task,
  onOpen,
}: {
  task: WorkItem & { status: string };
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const band = workBand(task);
  const late = daysLate(task.dueDate);

  /*
    Why this one, in the reader's language.

    Each band gets its own sentence rather than a generic "highest priority",
    which explains nothing and is the same for every job on the list.
  */
  const reason = (() => {
    if (band === 'doing') {
      return late && late > 0
        ? t('tasks.myWork.next.doingLate', { count: late })
        : t('tasks.myWork.next.doing');
    }
    if (band === 'blocked') return t('tasks.myWork.next.blocked');
    if (band === 'overdue') return t('tasks.myWork.next.overdue', { count: late ?? 0 });
    if (band === 'today') return t('tasks.myWork.next.today');
    return t('tasks.myWork.next.upcoming');
  })();

  return (
    <View style={s.card}>
      <View style={s.kicker}>
        <Ionicons name="arrow-forward-circle" size={13} color={COLORS.primary} />
        <Text style={s.kickerText}>{t('tasks.myWork.next.label')}</Text>
      </View>

      <Text style={s.title} numberOfLines={2}>
        {task.title}
      </Text>
      <Text style={s.reason}>{reason}</Text>

      <TouchableOpacity style={s.go} onPress={onOpen} accessibilityRole="button">
        <Ionicons name="play" size={16} color={COLORS.white} />
        <Text style={s.goText}>{t('tasks.myWork.next.open')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1.5,
      borderColor: COLORS.primary,
      borderRadius: 15,
      padding: 14,
      marginBottom: 6,
      // Tints with the theme: a soft mint in light, a deep green in dark.
      backgroundColor: c.primaryLight,
    },
    kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
    kickerText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: COLORS.primary,
    },
    title: { fontSize: 15.5, fontWeight: '700', color: c.textPrimary, lineHeight: 20 },
    reason: { marginTop: 4, marginBottom: 12, fontSize: 12.5, color: c.textSecondary },
    go: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: COLORS.primary,
      borderRadius: 10,
      paddingVertical: 11,
    },
    goText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  });
