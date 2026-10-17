import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { rotaApi, type RotaCell, type RotaShift } from '../../lib/api';
import { AText, PrimaryButton } from '../amazen';
import { Banner, JobSheet } from '../job/job-ui';

export const NAME_W = 70;

/** "07–15" when on the hour, "07:30–15" otherwise — a cell is 40pt wide. */
export const short = (hhmm: string) => (hhmm.endsWith(':00') ? hhmm.slice(0, 2) : hhmm);

export function Cell({ cell, shift, onPress }: { cell: RotaCell; shift?: RotaShift; onPress?: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const tint = shift?.color ?? c.accent;
  const style = cell.kind === 'shift'
    ? { backgroundColor: `${tint}33`, color: c.inkStrong }
    : cell.kind === 'schedule'
      ? { backgroundColor: c.tile, color: c.ink }
      : cell.kind === 'leave'
        ? { backgroundColor: c.warnTint, color: c.warn }
        : { backgroundColor: 'transparent', color: c.lineField };
  const text =
    cell.kind === 'shift' || cell.kind === 'schedule'
      ? `${short(cell.start)}\n${short(cell.end)}`
      : cell.kind === 'leave'
        ? t('rota.leaveCell', 'Leave')
        : '—';
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flex: 1,
        height: 44,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: style.backgroundColor,
        opacity: pressed ? 0.7 : 1,
        borderWidth: cell.kind === 'shift' && cell.source === 'once' ? 1 : 0,
        borderColor: tint,
      })}>
      <AText
        numeric
        style={{ fontFamily: amazen.font.mono, fontSize: 10, lineHeight: 13, textAlign: 'center', color: style.color }}
      >
        {text}
      </AText>
    </Pressable>
  );
}

export function Legend({ shifts }: { shifts: RotaShift[] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const item = (swatch: string, label: string, border?: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch, borderWidth: border ? 1 : 0, borderColor: border }} />
      <AText variant="caption" tone="onGlass" style={{ fontSize: 11 }}>{label}</AText>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(3), paddingHorizontal: amazen.space(1) }}>
      {shifts.map((s) => item(`${s.color ?? c.accent}55`, `${s.name} ${s.startLocal}–${s.endLocal}`))}
      {item(c.tile, t('rota.legendSchedule', 'Weekly schedule (no rota)'))}
      {item(c.warnTint, t('rota.legendLeave', 'Time off'))}
      {item('transparent', t('rota.legendOnce', 'This day only'), c.accent)}
    </View>
  );
}

export function RoundArrow({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: amazen.color.tile,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
      })}>
      <AText variant="body" tone="strong" style={{ fontSize: 20, lineHeight: 24 }}>{label}</AText>
    </Pressable>
  );
}

/** One person, one day: a shift or off, that day only or every week from then. */
export function DaySheet({
  person, spaceId, shifts, label, weekday, onClose, onSaved,
}: {
  person: { userId: string; name: string; cell: RotaCell };
  spaceId: string;
  shifts: RotaShift[];
  label: string;
  weekday: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const now = person.cell.kind === 'shift' ? person.cell.shiftId : null;
  const [choice, setChoice] = useState<string | null>(now);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    ⚠️ Said before Save, not after: a single day off from a standing shift is
    time off, and the server refuses it for that reason.
  */
  const offOnceBlocked = choice === null && repeat === 'once' && person.cell.kind === 'shift' && person.cell.source === 'weekly';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await rotaApi.setDay({ spaceId, userId: person.userId, date: person.cell.date, shiftId: choice, repeat });
      onSaved();
    } catch (e) {
      setError((e as Error)?.message || t('rota.saveFailed', 'Could not save the change.'));
    } finally {
      setBusy(false);
    }
  };

  const option = (id: string | null, name: string, hours?: string, color?: string | null) => {
    const on = choice === id;
    return (
      <Pressable key={id ?? 'off'} onPress={() => setChoice(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          padding: amazen.space(3.25),
          borderRadius: 16,
          backgroundColor: on ? c.accentTint : c.tile,
          borderWidth: 1.5,
          borderColor: on ? c.accent : 'transparent',
        }}>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: id ? color ?? c.accent : c.lineField }} />
        <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{name}</AText>
        {hours ? <AText variant="caption" tone="muted" numeric>{hours}</AText> : null}
      </Pressable>
    );
  };

  return (
    <JobSheet visible onClose={onClose} busy={busy} title={`${person.name} · ${label}`}>
      <View style={{ gap: amazen.space(2) }}>
        {shifts.map((s) => option(s.id, s.name, `${s.startLocal}–${s.endLocal}`, s.color))}
        {option(null, t('rota.off', 'Off'))}
      </View>
      <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
        {(['once', 'weekly'] as const).map((k) => {
          const on = repeat === k;
          return (
            <Pressable key={k} onPress={() => setRepeat(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{
                borderRadius: amazen.radius.full,
                paddingHorizontal: amazen.space(3),
                paddingVertical: amazen.space(2),
                backgroundColor: on ? c.accentTint : c.tile,
                borderWidth: 1.5,
                borderColor: on ? c.accent : 'transparent',
              }}>
              <AText variant="caption" style={{ fontSize: 13, color: on ? c.accent : c.ink }}>
                {k === 'once' ? t('rota.once', 'This day only') : t('rota.weekly', { defaultValue: 'Every {{weekday}}', weekday })}
              </AText>
            </Pressable>
          );
        })}
      </View>
      {offOnceBlocked ? <Banner tone="warn" text={t('rota.offOnceNeedsLeave', ('A single day off from a standing shift is time off — approve leave for ' + 'it, or set it off every week.'))} /> : null}
      {error ? <Banner tone="critical" text={error} /> : null}
      <PrimaryButton
        label={t('common.save', 'Save')}
        onPress={() => void save()}
        disabled={offOnceBlocked || (choice === now && repeat === 'once')}
        loading={busy}
      />
    </JobSheet>
  );
}
