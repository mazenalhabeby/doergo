import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { parseQuickAdd } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { AText, PrimaryButton, Sunken } from '../amazen';
import { JobField, JobSheet, SectionLabel } from '../job/job-ui';
import { calendarApi, type CalendarPerson } from '../../lib/api';
import { dayKey } from './calendar-data';
import { calendarError } from './errors';
import { offsetText } from './event-sheet';

const REMIND = [0, 10, 30, 60, 1440];

/**
 * + on the calendar: type it the way you would say it. The reader (shared parseQuickAdd) runs on
 * the phone as the member types and shows exactly what it understood — nothing is guessed silently.
 */
export function QuickAddSheet({ visible, day, onClose, onSaved }: { visible: boolean; day: Date; onClose: () => void; onSaved: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState('');
  const [reminders, setReminders] = useState<number[]>([10]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<CalendarPerson[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) { setText(''); setReminders([10]); setPeople([]); setQ(''); setPicking(false); }
  }, [visible]);

  useEffect(() => {
    if (!picking) return;
    let live = true;
    const timer = setTimeout(() => { calendarApi.people(q).then((r) => { if (live) setFound(r); }).catch(() => undefined); }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [q, picking]);

  const now = new Date();
  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, dayKey(now), now.getHours() * 60 + now.getMinutes()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text],
  );
  // A time with no day named goes on the day the member was looking at.
  const date = parsed?.date ?? dayKey(day);
  const timeStr = parsed?.time ?? null;
  const duration = parsed?.durationMin ?? 30;
  const start = timeStr ? new Date(`${date}T${timeStr}:00`) : null;
  const end = start ? new Date(start.getTime() + duration * 60000) : null;

  const whenText = start
    ? `${start.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${start.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}–${end!.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}`
    : `${new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${t('calendar.allDay', 'All day')}`;

  const save = async () => {
    if (!parsed?.title || busy) return;
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await calendarApi.create({
        kind: parsed.kind,
        title: parsed.title,
        timezone: tz,
        ...(start && end ? { startAt: start.toISOString(), endAt: end.toISOString() } : { allDay: true, startDate: date, endDate: date }),
        reminders,
        attendeeIds: people.map((p) => p.id),
      });
      toast.success(people.length ? t('calendar.invitedToast', { count: people.length }) : t('calendar.createdToast', 'Added to your calendar'));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(t('common.error', 'Error'), calendarError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobSheet visible={visible} onClose={onClose} busy={busy} title={t('calendar.add', 'Add')}>
      <View style={{ borderRadius: 20, padding: 1.5, backgroundColor: text ? c.accent : c.lineWell }}>
        <JobField
          value={text}
          onChangeText={setText}
          placeholder={t('calendar.smartPlaceholderShort', 'Remind me to call Müller at 2 for 30 min')}
          autoFocus
          multiline
          style={{ minHeight: 64, fontSize: 16, borderWidth: 0 }}
          maxLength={200}
        />
      </View>

      {parsed && parsed.parts.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {parsed.parts.map((p, i) => (
            <View key={i} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: c.accentTint }}>
              <AText variant="caption" tone="accent" style={{ fontSize: 12 }}>{p.text}</AText>
            </View>
          ))}
        </View>
      ) : null}

      <Sunken style={{ paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1) }}>
        <Line label={t('calendar.what', 'What')} value={parsed?.title || '—'} />
        <Line label={t('calendar.when', 'When')} value={whenText} />
        <Line label={t('calendar.kindLabel', 'Kind')} value={parsed?.kind === 'REMINDER' ? t('calendar.reminder', 'Reminder') : t('calendar.appointment', 'Appointment')} last />
      </Sunken>

      <SectionLabel>{t('calendar.remind', 'Remind')}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -amazen.space(1) }}>
        {REMIND.map((m) => {
          const on = reminders.includes(m);
          return (
            <Pressable
              key={m}
              onPress={() => setReminders((cur) => (on ? cur.filter((x) => x !== m) : [...cur, m]))}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1, borderColor: on ? c.accent : 'transparent' }}
            >
              <AText variant="caption" style={{ fontSize: 12.5, color: on ? c.accent : c.ink }}>{offsetText(m, t)}</AText>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>{t('calendar.invite', 'Invite')}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -amazen.space(1) }}>
        {people.map((p) => (
          <Pressable key={p.id} onPress={() => setPeople((cur) => cur.filter((x) => x.id !== p.id))} accessibilityRole="button" accessibilityLabel={t('calendar.remove', 'Remove')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.accentTint }}>
            <AText variant="caption" tone="accent" style={{ fontSize: 12.5 }}>{`${p.firstName} ${p.lastName}  ×`}</AText>
          </Pressable>
        ))}
        {!picking ? (
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.tile }}>
            <AText variant="caption" tone="ink" style={{ fontSize: 12.5 }}>{`＋ ${t('calendar.addPeople', 'Add people')}`}</AText>
          </Pressable>
        ) : null}
      </View>
      {picking ? (
        <View style={{ gap: 6 }}>
          <JobField value={q} onChangeText={setQ} placeholder={t('calendar.searchPeople', 'Search colleagues…')} autoFocus />
          {found.filter((f) => !people.some((p) => p.id === f.id)).slice(0, 6).map((f) => (
            <Pressable key={f.id} onPress={() => { setPeople((cur) => [...cur, f]); setQ(''); setPicking(false); }} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: pressed ? c.tile : 'transparent' })}>
              <AText variant="body" tone="strong" style={{ fontSize: 14 }}>{`${f.firstName} ${f.lastName}`}</AText>
              {f.position ? <AText variant="caption" tone="muted">{f.position}</AText> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        label={people.length ? t('calendar.saveAndInvite', 'Save & invite') : t('calendar.save', 'Save')}
        onPress={() => void save()}
        disabled={!parsed?.title || busy}
        loading={busy}
      />
    </JobSheet>
  );
}

function Line({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { amazen } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: amazen.space(2.5), borderBottomWidth: last ? 0 : 1, borderBottomColor: amazen.color.lineWell }}>
      <AText variant="caption" tone="muted" style={{ width: 64, fontSize: 13 }}>{label}</AText>
      <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 14, textAlign: 'right' }}>{value}</AText>
    </View>
  );
}
