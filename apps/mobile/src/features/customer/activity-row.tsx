import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';
import type { MobileCustomerActivity } from '@/lib/api';

/*
  ⚠️ A REMINDER always is amber on the rail, whatever its reason is.

  Drawing a reminder-to-call with the telephone icon would give it the same
  mark as a call that HAPPENED — the one confusion this whole feature exists to
  prevent (see `crm/reminder.ts` in shared). The reason is said in words, on the
  heading, where it cannot be mistaken for a record of the past.
*/
export type PendingActivity = MobileCustomerActivity & { pendingSync?: boolean };

/** A reminder's extras — "1 hour before", "Weekly". Words only; the rail carries the kind. */
export interface ActivityTag {
  label: string;
}

/**
 * One entry on the client's timeline: a ringed dot on a rail, the heading and
 * who/when, the text, and — on a reminder — the tick. The rail is drawn by
 * the row, so a FlatList can recycle entries and the line still runs through.
 */
export const ActivityRow = memo(function ActivityRow({
  activity,
  heading,
  meta,
  onToggleDone,
  doneLabel,
  tags,
  continues,
  waiting,
}: {
  activity: PendingActivity;
  heading: string;
  meta: string;
  onToggleDone?: (a: MobileCustomerActivity) => void;
  doneLabel?: string;
  tags?: ActivityTag[];
  /** Another entry follows the same day — the rail runs on. */
  continues: boolean;
  /** Not sent yet — shown instead of a time. */
  waiting?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const overdue = activity.type === 'REMINDER' && !!activity.dueAt && !activity.doneAt && new Date(activity.dueAt).getTime() < Date.now();
  const done = !!activity.doneAt;
  const ring = done
    ? c.accent
    : overdue
      ? c.critical
      : activity.type === 'REMINDER'
        ? c.warn
        : activity.type === 'NOTE' || activity.type === 'CALL'
          ? c.accent
          : c.inkMuted;
  return (
    <View style={{ flexDirection: 'row', gap: amazen.space(3) }}>
      <View style={{ width: 14, alignItems: 'center' }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: ring,
            backgroundColor: done ? ring : 'transparent',
            marginTop: 5,
          }}
        />
        {continues ? <View style={{ flex: 1, width: 2, borderRadius: 1, backgroundColor: c.lineWell, marginTop: 4 }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: amazen.space(4) }}>
        <AText variant="body" tone={done ? 'muted' : 'strong'} style={{ fontSize: 14 }}>{heading}</AText>
        {activity.body ? (
          <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 20, marginTop: 2 }}>
            {activity.body}
          </AText>
        ) : null}
        <AText variant="caption" numberOfLines={2} style={{ marginTop: 3, color: c.inkMuted }}>
          {[...(tags ?? []).map((x) => x.label), meta].filter(Boolean).join(' · ')}
          {waiting ? <AText variant="caption" style={{ color: c.warn }}>{` · ${waiting}`}</AText> : null}
        </AText>
        {activity.type === 'REMINDER' && onToggleDone && doneLabel ? (
          <Pressable
            onPress={() => onToggleDone(activity)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={doneLabel}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: amazen.space(2),
              alignSelf: 'flex-start',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: done ? c.accent : c.lineGlass,
                backgroundColor: done ? c.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {done ? <AText style={{ color: c.accentInk, fontSize: 11, lineHeight: 13 }}>✓</AText> : null}
            </View>
            <AText variant="caption" style={{ color: done ? c.accent : overdue ? c.critical : c.ink }}>{doneLabel}</AText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
