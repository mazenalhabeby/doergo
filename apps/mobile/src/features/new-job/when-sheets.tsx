import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, PrimaryButton, QuietButton } from '@/components/amazen';
import { JobSheet } from '../job/job-ui';
import { HOURS, MINUTES, isPastDay, monthGrid, two } from './new-job-logic';
import { isSameDay } from '@/lib/utils';
import { DayPickerTop, WeekdayHeads } from './day-picker-parts';

/**
 * "When" — the day and the hour, each in the ONE sheet (`JobSheet`).
 *
 * ⚠️ They replace `DatePickerModal` and `TimePickerModal`, which are raw
 * `<Modal>`s outside the one-slot queue. Still JavaScript on purpose: the
 * native date picker would need a store build before anybody could use it.
 */


/** A cell in a grid of choices — a day, an hour, a minute. */
function Cell({
  label,
  on,
  today,
  disabled,
  onPress,
}: {
  label: string;
  on: boolean;
  today?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? c.accentTint : pressed ? c.tile : 'transparent',
        borderWidth: 1.5, borderColor: on ? c.accent : today ? c.lineField : 'transparent',
        opacity: disabled ? 0.3 : 1,
      })}
    >
      <AText numeric numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, color: on ? c.accent : c.inkStrong }}>{label}</AText>
    </Pressable>
  );
}

/** Which day — Today and Tomorrow at the top, a month under them, days before today closed. */
export function DaySheet({ visible, value, onPick, onClear, onClose }: {
  visible: boolean;
  value: Date | null;
  onPick: (d: Date) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const [view, setView] = useState(() => { const d = value ?? new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  // Open on the CHOSEN month each time — the sheet stays mounted while hidden.
  useEffect(() => {
    if (!visible) return;
    const d = value ?? new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const weeks = useMemo(() => monthGrid(view.y, view.m), [view]);
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const shift = (by: number) => setView((v) => { const d = new Date(v.y, v.m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const atStart = view.y === now.getFullYear() && view.m === now.getMonth();
  const pick = (d: Date) => { onPick(d); onClose(); };

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('newJob.whichDay')}>
      <DayPickerTop
        year={view.y}
        month={view.m}
        onToday={() => pick(now)}
        onTomorrow={() => pick(tomorrow)}
        onShift={shift}
        prevDisabled={atStart}
      />
      <View style={{ gap: 4 }}>
        <WeekdayHeads />
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((d, di) => d ? (
              <Cell
                key={di}
                label={String(d.getDate())}
                on={!!value && isSameDay(value, d)}
                today={isSameDay(d, now)}
                disabled={isPastDay(d, now)}
                onPress={() => pick(d)}
              />
            ) : <View key={di} style={{ flex: 1, height: 40 }} />)}
          </View>
        ))}
      </View>
      {value ? <QuietButton tone="critical" label={t('common.clear')} onPress={() => { onClear(); onClose(); }} /> : null}
    </JobSheet>
  );
}

/** The hour to be there — hours and five-minute steps, both as grids so nothing scrolls inside the sheet. */
export function TimeSheet({ visible, value, onPick, onClear, onClose, title }: {
  visible: boolean;
  /** The question the sheet asks — "Be there at" unless the caller asks another. */
  title?: string;
  /** "HH:mm", or "" for no fixed hour. */
  value: string;
  onPick: (hhmm: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const [hh, mm] = value.split(':');
    setH(Number(hh) || (value ? 0 : 9));
    setM(Number(mm) || 0);
  }, [visible, value]);
  const rows = <T,>(xs: readonly T[], per: number) =>
    Array.from({ length: Math.ceil(xs.length / per) }, (_, i) => xs.slice(i * per, i * per + per));

  return (
    <JobSheet visible={visible} onClose={onClose} title={title ?? t('createTask.beThereAt')}>
      <AText
        numeric
        style={{ fontSize: 34, lineHeight: 40, textAlign: 'center', color: amazen.color.inkStrong }}
      >{`${two(h)}:${two(m)}`}</AText>
      <View style={{ gap: 4 }}>
        {rows(HOURS, 6).map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
            {r.map((x) => <Cell key={x} label={two(x)} on={x === h} onPress={() => setH(x)} />)}
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: amazen.color.lineWell }} />
      <View style={{ gap: 4 }}>
        {rows(MINUTES, 6).map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 4 }}>
            {r.map((x) => <Cell key={x} label={`:${two(x)}`} on={x === m} onPress={() => setM(x)} />)}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: amazen.space(2), alignItems: 'center' }}>
        {value ? (
          <View style={{ flex: 1 }}>
            <QuietButton
              tone="critical"
              label={t('common.clear')}
              onPress={() => {
                onClear();
                onClose();
              }}
            />
          </View>
        ) : null}
        <PrimaryButton label={t('common.done')} onPress={() => { onPick(`${two(h)}:${two(m)}`); onClose(); }} style={{ flex: 1 }} />
      </View>
    </JobSheet>
  );
}
