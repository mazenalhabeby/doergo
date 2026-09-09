import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { COLORS, type ThemeColors } from '../../lib/constants';
import { useTheme } from '../../contexts/theme-context';
import {
  departureAdvice,
  straightLineTravel,
  haversineDistance,
  type TravelEstimate,
  type DepartureAdvice,
} from '@hbcfield/shared/client';

/**
 * "Be there at one" — and, more usefully, when to set off.
 *
 * A client names an arrival time; the member needs the departure time, which is
 * that less the drive. This card is the whole point of putting an hour on a
 * task: without it the member reads "13:00", leaves at 13:00, and arrives late.
 *
 * ⚠️ The estimate is computed HERE, from the phone's own position, using a
 * straight-line distance inflated for real roads. No request, no API bill, and
 * it works with no signal in a valley. A road-accurate figure from the route
 * engine can replace it later by passing `travel` in — the card does not care
 * where the number came from, only how good it is said to be.
 *
 * ⚠️ Rendered only when there is something to say. A job with no hour, or one
 * on another day, returns a state this refuses to draw — a card that appears on
 * every task teaches people to ignore it.
 */
export function BeThereCard({
  dueDate,
  taskLat,
  taskLng,
  here,
  atSite,
  travel,
  siteOffsetMinutes,
}: {
  dueDate?: string | Date | null;
  taskLat?: number | null;
  taskLng?: number | null;
  /** The phone's current position, if it is known. */
  here?: { lat: number; lng: number } | null;
  atSite?: boolean;
  /** A better estimate, when one is available. */
  travel?: TravelEstimate;
  siteOffsetMinutes?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  /*
    A minute is the resolution anybody acts on, so the clock ticks once a
    minute rather than on every render — and never on a card that is not
    counting down to anything.
  */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const estimate: TravelEstimate = useMemo(() => {
    if (travel) return travel;
    if (here && taskLat != null && taskLng != null) {
      return straightLineTravel(haversineDistance(here.lat, here.lng, taskLat, taskLng));
    }
    return { seconds: 0, source: 'unknown' };
  }, [travel, here, taskLat, taskLng]);

  const advice: DepartureAdvice = departureAdvice({
    now,
    appointment: dueDate ? new Date(dueDate) : null,
    travel: estimate,
    atSite,
    siteOffsetMinutes,
  });

  // Nothing worth a card: no hour on the job, or it is not today.
  if (advice.state === 'no-time' || advice.state === 'not-today') return null;

  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const beThere = dueDate ? time(new Date(dueDate)) : '';

  const tone =
    advice.state === 'late' ? 'late'
    : advice.state === 'go' ? 'go'
    : advice.state === 'arrived' ? 'arrived'
    : 'calm';

  const line = (() => {
    switch (advice.state) {
      case 'arrived':
        return t('tasks.beThere.arrived', 'You are at the site');
      case 'go':
        return t('tasks.beThere.go', 'Leave now');
      case 'late':
        return t('tasks.beThere.late', {
          defaultValue: 'Arriving {{time}} — {{count}} min late',
          time: advice.arriveAt ? time(advice.arriveAt) : '',
          count: advice.lateByMinutes,
        });
      case 'soon':
        return t('tasks.beThere.soon', {
          defaultValue: 'Leave in {{count}} min',
          count: advice.minutesUntilLeave ?? 0,
        });
      default:
        return advice.leaveAt
          ? t('tasks.beThere.plenty', {
              defaultValue: 'Leave by {{time}}',
              time: time(advice.leaveAt),
            })
          : t('tasks.beThere.noEstimate', 'Travel time unknown');
    }
  })();

  return (
    <View style={[s.card, s[tone]]}>
      <View style={s.row}>
        <Ionicons
          name={tone === 'late' ? 'alert-circle' : tone === 'go' ? 'car' : 'time-outline'}
          size={16}
          color={tone === 'late' ? COLORS.error : COLORS.primary}
        />
        <Text style={s.beThere}>
          {t('tasks.beThere.title', { defaultValue: 'Be there {{time}}', time: beThere })}
        </Text>
      </View>
      <Text style={[s.line, tone === 'late' && s.lineLate]}>{line}</Text>
      {/*
        Says so when the figure is a guess. A member deciding whether to trust
        "leave in 4 minutes" deserves to know it came from a straight line and
        not from the roads.
      */}
      {estimate.source === 'straight-line' && advice.state !== 'arrived' && (
        <Text style={s.hint}>{t('tasks.beThere.estimated', 'Estimated drive')}</Text>
      )}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 11,
      paddingHorizontal: 13,
      marginBottom: 10,
      backgroundColor: c.input,
      borderColor: c.border,
    },
    calm: {},
    arrived: { borderColor: COLORS.primary },
    go: { borderColor: COLORS.primary, backgroundColor: c.primaryLight },
    late: { borderColor: COLORS.error },
    row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    beThere: { fontSize: 14.5, fontWeight: '700', color: c.textPrimary },
    line: { marginTop: 3, fontSize: 13, color: c.textSecondary },
    lineLate: { color: COLORS.error, fontWeight: '600' },
    hint: { marginTop: 4, fontSize: 11, color: c.textMuted },
  });
