import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { techniciansApi, scheduleApi } from '../../../src/lib/api';
import type { TechnicianListItem, ScheduleEntry } from '../../../src/lib/api/types';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../../../src/lib/constants';
import { Skeleton } from '../../../src/components';

// DAY_NAMES will be resolved via t() inside the component

interface TechSchedule {
  tech: TechnicianListItem;
  schedule: ScheduleEntry[];
}

export default function SchedulesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const dayNames = t('dayNames.short', { returnObjects: true }) as string[];
  const [data, setData] = useState<TechSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSchedules = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      const techResult = await techniciansApi.list({ status: 'active', limit: 100 });
      const techs: TechnicianListItem[] = Array.isArray(techResult) ? techResult : (techResult as any)?.data || [];

      const schedules: TechSchedule[] = [];
      for (const tech of techs) {
        try {
          const schedule = await scheduleApi.getMine(tech.id);
          schedules.push({ tech, schedule: Array.isArray(schedule) ? schedule : [] });
        } catch {
          schedules.push({ tech, schedule: [] });
        }
      }

      setData(schedules);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error(t('common.error'), err?.message || t('manage.schedulesScreen.failedToLoad'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchSchedules(); }, [fetchSchedules]));

  const renderItem = ({ item }: { item: TechSchedule }) => {
    const { tech, schedule } = item;
    const scheduleMap = new Map(schedule.map(s => [s.dayOfWeek, s]));

    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardHeader}>
          <View style={[s.avatar, { backgroundColor: COLORS.primary + '20' }]}>
            <Text style={[s.avatarText, { color: COLORS.primary }]}>
              {tech.firstName[0]}{tech.lastName[0]}
            </Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={[s.name, { color: colors.textPrimary }]}>
              {tech.firstName} {tech.lastName}
            </Text>
            {tech.specialty && (
              <Text style={[s.specialty, { color: colors.textMuted }]}>{tech.specialty}</Text>
            )}
          </View>
        </View>

        <View style={s.daysRow}>
          {dayNames.map((day, idx) => {
            const entry = scheduleMap.get(idx);
            const isActive = entry?.isActive;
            return (
              <View
                key={idx}
                style={[
                  s.dayBox,
                  { backgroundColor: isActive ? COLORS.primary + '15' : colors.surfaceRaised, borderColor: isActive ? COLORS.primary + '40' : 'transparent' },
                ]}
              >
                <Text style={[s.dayLabel, { color: isActive ? COLORS.primary : colors.textMuted }]}>{day}</Text>
                {isActive && entry ? (
                  <Text style={[s.dayTime, { color: colors.textSecondary }]}>
                    {entry.startTime?.slice(0, 5)}{'\n'}{entry.endTime?.slice(0, 5)}
                  </Text>
                ) : (
                  <Text style={[s.dayOff, { color: colors.borderLight }]}>—</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.surface }]}>
        <Skeleton.ListScreen />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface }]}>
      <FlatList
        data={data}
        keyExtractor={item => item.tech.id}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchSchedules(true)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>{t('manage.schedulesScreen.noTechnicians')}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxl },
  card: { borderRadius: RADIUS.md, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  headerInfo: { flex: 1 },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  specialty: { fontSize: FONT_SIZE.sm, marginTop: 1 },
  daysRow: { flexDirection: 'row', gap: SPACING.xs },
  dayBox: { flex: 1, alignItems: 'center', paddingVertical: SPACING.sm, borderRadius: RADIUS.sm, borderWidth: 1 },
  dayLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },
  dayTime: { fontSize: 9, textAlign: 'center', marginTop: 2, lineHeight: 12 },
  dayOff: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.base, marginTop: SPACING.md },
});
