import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ScreenContainer, ScreenHeader } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from '../../src/lib/constants';
import { formatTimeOfDay } from '../../src/lib/utils';
import { useConnectivity, useOffline, useSyncStatus } from '../../src/offline/offline-context';
import { OfflineBanner } from '../../src/offline/components/offline-banner';
import type { OutboxOp } from '../../src/offline/outbox/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the phone is holding for the member: what needs them, what is
 * waiting, and what went through today.
 *
 * ⚠️ Nothing is ever dropped silently. An operation the server refused stays
 * here, in words, until the member dismisses it — the office changed something
 * while they were offline, and they deserve to know their "arrived" did not
 * count rather than discover it at payroll.
 */
export default function SyncScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { available, engine } = useOffline();
  const connectivity = useConnectivity();
  const { snapshot, operations } = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  const hour12 = user?.timeFormat === '12h';

  const groups = useMemo(() => {
    const since = Date.now() - DAY_MS;
    return {
      attention: operations.filter((o) => o.state === 'conflict' || o.state === 'failed'),
      waiting: operations.filter((o) => ['pending', 'inflight', 'retry', 'awaiting_auth'].includes(o.state)),
      sent: operations.filter((o) => o.state === 'done' && o.updatedAt >= since).reverse(),
    };
  }, [operations]);

  const refresh = useCallback(async () => {
    if (!engine) return;
    setRefreshing(true);
    try {
      await engine.syncAll();
    } finally {
      setRefreshing(false);
    }
  }, [engine]);

  const label = (o: OutboxOp) => t(`offline.ops.${o.op.replace(/\./g, '_')}`, { defaultValue: o.op });
  const reason = (o: OutboxOp) => {
    const code = o.lastError?.code;
    if (code) {
      const known = t(`offline.errors.${code}`, { defaultValue: '' });
      if (known) return known;
    }
    if (o.state === 'conflict') return t('offline.errors.CONFLICT');
    return o.lastError?.message || t('offline.errors.default');
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScreenHeader title={t('offline.sync.title')} />
      <ScreenContainer>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + SPACING.xxxl }]}
          refreshControl={available ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} /> : undefined}
        >
          {!available ? (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} />
              <Text style={[s.body, { color: colors.textSecondary }]}>{t('offline.sync.unavailable')}</Text>
            </View>
          ) : (
            <>
              <OfflineBanner />
              <Text style={[s.meta, { color: colors.textMuted }]}>
                {snapshot.lastSuccessAt
                  ? t('offline.sync.lastSynced', { time: formatTimeOfDay(snapshot.lastSuccessAt, hour12) })
                  : t('offline.sync.neverSynced')}
              </Text>

              {groups.attention.length > 0 && (
                <Section title={t('offline.sync.attention')} count={groups.attention.length}>
                  {groups.attention.map((o) => (
                    <View key={o.id} style={[s.card, s.cardAttention, { backgroundColor: colors.card, borderColor: COLORS.error }]}>
                      <View style={s.row}>
                        <Text style={[s.title, { color: colors.textPrimary }]}>{label(o)}</Text>
                        <Text style={[s.time, { color: colors.textMuted }]}>{formatTimeOfDay(o.createdAt, hour12)}</Text>
                      </View>
                      <Text style={[s.body, { color: colors.textSecondary }]}>{reason(o)}</Text>
                      <View style={s.actions}>
                        {o.state === 'failed' && (
                          <TouchableOpacity onPress={() => void engine?.retry(o.id)} style={[s.button, { borderColor: colors.border }]}>
                            <Text style={[s.buttonText, { color: colors.textPrimary }]}>{t('offline.sync.retry')}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => void engine?.discard(o.id)} style={[s.button, { borderColor: colors.border }]}>
                          <Text style={[s.buttonText, { color: colors.textPrimary }]}>
                            {o.state === 'conflict' ? t('offline.sync.gotIt') : t('offline.sync.discard')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </Section>
              )}

              <Section title={t('offline.sync.waiting')} count={groups.waiting.length}>
                {groups.waiting.length === 0 ? (
                  <Text style={[s.body, { color: colors.textMuted }]}>{t('offline.sync.nothingWaiting')}</Text>
                ) : (
                  groups.waiting.map((o) => (
                    <View key={o.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={s.row}>
                        <Text style={[s.title, { color: colors.textPrimary }]}>{label(o)}</Text>
                        <Text style={[s.time, { color: colors.textMuted }]}>
                          {t('offline.sync.waitingSince', { time: formatTimeOfDay(o.createdAt, hour12) })}
                        </Text>
                      </View>
                      {connectivity !== 'online' && (
                        <Text style={[s.body, { color: colors.textMuted }]}>{t('offline.sync.offlineNow')}</Text>
                      )}
                    </View>
                  ))
                )}
              </Section>

              {groups.sent.length > 0 && (
                <Section title={t('offline.sync.sent')} count={groups.sent.length}>
                  {groups.sent.map((o) => (
                    <View key={o.id} style={[s.card, s.cardSent, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.title, s.grow, { color: colors.textPrimary }]}>{label(o)}</Text>
                      <Text style={[s.time, { color: colors.textMuted }]}>{formatTimeOfDay(o.createdAt, hour12)}</Text>
                      <Ionicons name="checkmark" size={18} color={COLORS.success} />
                    </View>
                  ))}
                </Section>
              )}

              {connectivity === 'online' && (
                <TouchableOpacity onPress={refresh} disabled={refreshing} style={[s.syncNow, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.syncNowText, { color: COLORS.primary }]}>{t('offline.sync.syncNow')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.textMuted }]}>
        {title} · {count}
      </Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md },
  meta: { fontSize: FONT_SIZE.sm },
  section: { gap: SPACING.sm, marginTop: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionBody: { gap: SPACING.sm },
  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.xs },
  cardAttention: { borderLeftWidth: 3 },
  cardSent: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  title: { flexShrink: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  time: { fontSize: FONT_SIZE.xs },
  grow: { flex: 1 },
  body: { fontSize: FONT_SIZE.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  button: { borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.xs + 2, paddingHorizontal: SPACING.md },
  buttonText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  syncNow: { alignItems: 'center', borderRadius: RADIUS.lg, paddingVertical: SPACING.md, marginTop: SPACING.md },
  syncNowText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
