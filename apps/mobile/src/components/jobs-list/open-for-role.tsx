import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tasksApi, type OpenRoleTask } from '../../lib/api';
import { formatDistance, refusalText } from '../../lib/distance';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { AText, WellDivider, QuietButton, SectionLabel } from '../amazen';

/**
 * "Open for your role" — jobs opened to a work role I hold, in the workspace I
 * hold it in (shared tasks/role-pool.ts). The first to take each place gets it.
 *
 * ⚠️ ONLINE ONLY, deliberately. Taking a place is a race decided by the server
 * in one conditional update; a "take" queued offline would promise a job that
 * somebody else has already been given. The section simply hides offline.
 *
 * Renders nothing when there is nothing open — most people, most of the time.
 * Read on focus and on pull-to-refresh, never on a timer.
 */
export function OpenForRole({ refreshKey, onTaken, onOpen }: {
  /** Bumped by the screen's pull-to-refresh, so one gesture refreshes both. */
  refreshKey: number;
  /** After a take: the screen refreshes its own list (the job is now mine). */
  onTaken: (taskId: string) => void;
  onOpen: (taskId: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const c = amazen.color;
  const [rows, setRows] = useState<OpenRoleTask[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await tasksApi.openForMe());
    } catch {
      // Offline or refused: show nothing rather than a stale promise of a job.
      setRows([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { if (refreshKey > 0) void load(); }, [refreshKey, load]);

  const take = async (row: OpenRoleTask) => {
    setBusy(row.id);
    try {
      await tasksApi.take(row.id);
      toast.success(t('roleTasks.youTookIt'), row.title);
      setRows((r) => r.filter((x) => x.id !== row.id));
      onTaken(row.id);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      toast.error(t('roleTasks.couldNotTake'), refusalText(t, err, t('roleTasks.couldNotTake')));
      void load();
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <View style={{ gap: amazen.space(2) }}>
      <SectionLabel tone="accent">{`${t('roleTasks.title')} · ${rows.length}`}</SectionLabel>
      <View style={{ backgroundColor: c.well, borderRadius: 26, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1) }}>
        {rows.map((row, i) => (
          <View key={row.id}>
            {i > 0 ? <WellDivider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AText
                  variant="body"
                  tone="strong"
                  numberOfLines={1}
                  onPress={() => onOpen(row.id)}
                  accessibilityRole="link"
                >
                  {row.priority === 'URGENT' ? `${t('roleTasks.urgent')} · ${row.title}` : row.title}
                </AText>
                <AText variant="caption" tone="ink" numberOfLines={1}>
                  {[
                    row.roleName,
                    (row.openSpots ?? 1) > 1 ? t('roleTasks.placesLeft', { count: row.openSpotsLeft ?? 0 }) : null,
                    row.spaceName,
                    row.distanceKm != null ? formatDistance(row.distanceKm * 1000) : null,
                  ].filter(Boolean).join(' · ')}
                </AText>
              </View>
              <QuietButton
                tone="accent"
                label={busy === row.id ? t('roleTasks.taking') : t('roleTasks.take')}
                disabled={busy !== null}
                onPress={() => void take(row)}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
