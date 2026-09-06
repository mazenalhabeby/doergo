import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../contexts/toast-context';
import { attendanceApi } from '../lib/api';
import {
  outstandingBreaks,
  type BreakPlanItem,
} from '@hbcfield/shared/client';

/**
 * The rests planned for the shift being worked right now.
 *
 * A card and not a modal: a rest is part of the day, not an interruption to be
 * dismissed, and the member should see the next one coming without anything
 * appearing over what they are doing. The interrupting is the notification's
 * job — this is where they act on it.
 *
 * Every deadline on it comes from the server. Nothing here counts down to
 * anything the phone decided, so an app that was closed all afternoon opens to
 * the right state.
 */

function hm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface RestCardProps {
  plan: BreakPlanItem[];
  activeBreak?: { id: string; startedAt: string; ruleId?: string | null } | null;
  /** Refetch the shift after any of these actions. */
  onChanged: () => void;
}

export function RestCard({ plan, activeBreak, onChanged }: RestCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState<'start' | 'end' | 'later' | null>(null);

  /*
    One tick a minute for the whole card.

    The numbers here are minutes. A per-second timer would redraw sixty times
    for every change a reader could see, which on a screen somebody leaves open
    through a shift is a battery cost with no audience.
  */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const run = async (kind: 'start' | 'end' | 'later', fn: () => Promise<unknown>, ok: string) => {
    setBusy(kind);
    try {
      await fn();
      onChanged();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error', 'Something went wrong'));
    } finally {
      setBusy(null);
    }
  };

  // ── On a rest right now ─────────────────────────────────────────────────
  if (activeBreak) {
    const planned = plan.find((i) => i.ruleId === activeBreak.ruleId);
    const elapsed = Math.max(0, Math.round((now - new Date(activeBreak.startedAt).getTime()) / 60_000));
    const target = planned?.durationMinutes ?? null;
    const over = target != null && elapsed >= target;

    return (
      <View style={[styles.card, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
        <View style={styles.head}>
          <Ionicons name="cafe" size={20} color="#059669" />
          <Text style={[styles.title, { color: '#065F46' }]}>
            {planned?.name ?? t('attendance.rest.onRest', 'On rest')}
          </Text>
        </View>

        <Text style={[styles.big, { color: over ? '#B45309' : '#047857' }]}>{hm(elapsed)}</Text>
        <Text style={[styles.sub, { color: '#047857' }]}>
          {target != null
            ? over
              ? t('attendance.rest.overBy', '{{over}} past your {{total}}', {
                  over: hm(elapsed - target),
                  total: hm(target),
                })
              : t('attendance.rest.ofTotal', 'of {{total}}', { total: hm(target) })
            : t('attendance.rest.untimed', 'Untimed')}
          {planned && !planned.isPaid ? ` · ${t('attendance.rest.unpaid', 'unpaid')}` : ''}
        </Text>

        {target != null && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, (elapsed / target) * 100)}%`,
                  backgroundColor: over ? '#F59E0B' : '#059669',
                },
              ]}
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.primary, { backgroundColor: '#059669' }]}
          onPress={() => run('end', () => attendanceApi.endBreak(), t('attendance.rest.ended', 'Back to work'))}
          disabled={busy !== null}
          activeOpacity={0.8}
        >
          {busy === 'end' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryText}>{t('attendance.rest.backToWork', 'Back to work')}</Text>
            </>
          )}
        </TouchableOpacity>
        {/* The honest reason to press it, rather than a nag. */}
        <Text style={[styles.hint, { color: '#047857' }]}>
          {t('attendance.rest.backHint', 'Until you do, the time keeps counting as rest.')}
        </Text>
      </View>
    );
  }

  const pending = outstandingBreaks(plan);
  const next = pending[0];
  const taken = plan.filter((i) => i.state === 'TAKEN');
  if (plan.length === 0) return null;

  // ── Nothing left to take ────────────────────────────────────────────────
  if (!next) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.head}>
          <Ionicons name="cafe-outline" size={20} color={colors.textMuted} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('attendance.rest.title', 'Rests')}
          </Text>
        </View>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {taken.length === plan.length
            ? t('attendance.rest.allDone', 'All your rests are taken.')
            : t('attendance.rest.allDoneWithMissed', 'Nothing more due today.')}
        </Text>
      </View>
    );
  }

  const dueIn = Math.round((new Date(next.dueAt).getTime() - now) / 60_000);
  const isDue = dueIn <= 0;

  return (
    <View
      style={[
        styles.card,
        isDue
          ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
          : { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
      ]}
    >
      <View style={styles.head}>
        <Ionicons name="cafe" size={20} color={isDue ? '#D97706' : colors.textMuted} />
        <Text style={[styles.title, { color: isDue ? '#92400E' : colors.textPrimary }]}>
          {isDue
            ? t('attendance.rest.timeFor', 'Time for your {{name}}', { name: next.name.toLowerCase() })
            : next.name}
        </Text>
        {!isDue && (
          <Text style={[styles.badge, { color: colors.textMuted }]}>
            {t('attendance.rest.dueIn', 'in {{gap}}', { gap: hm(dueIn) })}
          </Text>
        )}
      </View>

      <Text style={[styles.sub, { color: isDue ? '#B45309' : colors.textMuted }]}>
        {hm(next.durationMinutes)}
        {' · '}
        {next.isPaid
          ? t('attendance.rest.paidNote', 'paid')
          : t('attendance.rest.unpaidNote', 'comes off your paid hours')}
        {next.snoozeCount > 0
          ? ` · ${t('attendance.rest.postponedTimes', 'postponed {{n}}×', { n: next.snoozeCount })}`
          : ''}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.primary, styles.flex, { backgroundColor: '#059669' }]}
          onPress={() =>
            run(
              'start',
              () => attendanceApi.startBreak(undefined, undefined, next.ruleId),
              t('attendance.rest.started', 'Rest started'),
            )
          }
          disabled={busy !== null}
          activeOpacity={0.8}
        >
          {busy === 'start' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cafe-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>{t('attendance.rest.startNow', 'Start rest')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* "Later" appears only once it is actually due — offering it early is
            offering to postpone something that has not happened yet. */}
        {isDue && (
          <TouchableOpacity
            style={[styles.secondary, styles.flex, { borderColor: '#FDE68A' }]}
            onPress={() =>
              run(
                'later',
                () => attendanceApi.snoozeBreak(next.ruleId),
                t('attendance.rest.postponed', "We'll ask again shortly"),
              )
            }
            disabled={busy !== null}
            activeOpacity={0.8}
          >
            {busy === 'later' ? (
              <ActivityIndicator size="small" color="#92400E" />
            ) : (
              <>
                <Ionicons name="alarm-outline" size={18} color="#92400E" />
                <Text style={styles.secondaryText}>{t('attendance.rest.later', 'Later')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: { fontSize: 12, fontVariant: ['tabular-nums'] },
  big: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  track: { height: 6, borderRadius: 999, backgroundColor: '#D1FAE5', overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', borderRadius: 999 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flex: { flex: 1 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, marginTop: 12,
  },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 12,
  },
  secondaryText: { color: '#92400E', fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 8 },
});
