import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';

/**
 * A shift drawn to scale — start to end, with a mark at each moment that
 * happened in it (a note, a rest). The work log reads as a DAY this way:
 * where the notes cluster is where the work was.
 *
 * ⚠️ POSITIONS ARE FRACTIONS OF THE SPAN, CLAMPED. A note stamped a minute
 * before the clock-in (a phone clock that runs fast) sits at the start, not
 * off the bar.
 */
export function DayBar({
  start,
  end,
  marks,
  filled,
  labels,
}: {
  start: Date;
  end: Date;
  marks: ReadonlyArray<{ at: Date; pending?: boolean }>;
  /** How much of the bar is lived — `now` for a running shift, the whole bar for a finished one. */
  filled: number;
  labels: [string, string, string];
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const span = Math.max(1, end.getTime() - start.getTime());
  const at = (d: Date) => Math.min(1, Math.max(0, (d.getTime() - start.getTime()) / span));
  return (
    <View style={{ gap: amazen.space(1.5) }}>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.tile, justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.round(Math.min(1, Math.max(0, filled)) * 100)}%`,
            borderRadius: 5,
            backgroundColor: c.accentTint,
          }}
        />
        {marks.map((m, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${(at(m.at) * 100).toFixed(1)}%` as `${number}%`,
              marginLeft: -2,
              width: 4,
              height: 18,
              borderRadius: 2,
              backgroundColor: m.pending ? c.warn : c.accent,
              borderWidth: 1.5,
              borderColor: c.well,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AText variant="caption" tone="muted" numeric>{labels[0]}</AText>
        <AText variant="caption" tone="accent" numeric>{labels[1]}</AText>
        <AText variant="caption" tone="muted" numeric>{labels[2]}</AText>
      </View>
    </View>
  );
}
