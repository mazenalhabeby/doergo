import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { utcToZonedInput, zonedInputToUtc } from '@hbcfield/shared/client';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../contexts/toast-context';
import { attendanceApi } from '../lib/api';
import type { TimeEntry } from '../lib/api/types';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { cityFromTz } from '../lib/utils';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { DatePickerModal } from './date-picker-modal';

/**
 * Correcting somebody's hours, from a phone.
 *
 * The forgotten clock-out is the commonest thing in attendance and the one a
 * supervisor notices while standing on the site — so the correction has to be
 * possible there, not only at a desk. What it deliberately is NOT is the web
 * dialog: no breaks editor, no timezone re-assignment, no delete. Those are
 * rarer, destructive or fiddly, and a thumb is the wrong instrument for them.
 *
 * Times are shown and typed in the ENTRY's own zone — captured at clock-in,
 * with the space's zone behind it — and the zone is named on screen, because a
 * supervisor in one country correcting a crew in another must see which clock
 * they are typing into. The conversion is the shared one the web dialog uses.
 *
 * `reason` is required by the server and kept with the entry: the shift then
 * says who changed it, when, from what, and why.
 */

/** Split a wall-clock "yyyy-MM-ddTHH:mm" into the two things a phone edits. */
function splitWall(wall: string): { date: string; time: string } {
  const [date = '', time = ''] = wall.split('T');
  return { date, time };
}

const joinWall = (date: string, time: string) => (date && time ? `${date}T${time}` : '');

/** "yyyy-MM-dd" ↔ Date, for the calendar. Local-only: it is a calendar day. */
function dateFromISO(d: string): Date | null {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}
function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

/** HH:MM, 24-hour — the format the field accepts however the app displays time. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One clock: a day picked from a calendar, a time typed as HH:MM.
 *
 * Declared at module scope, NOT inside the sheet. A component defined during
 * render is a new type every render, so React unmounts and remounts it — the
 * time field would lose focus and the keyboard would close after every single
 * digit, which is unusable and looks like the app dropping input.
 */
function TimeField({
  label,
  date,
  time,
  onTime,
  onPick,
  colors,
  placeholder,
  hint,
}: {
  label: string;
  date: string;
  time: string;
  onTime: (v: string) => void;
  onPick: () => void;
  colors: { surface: string; border: string; textPrimary: string; textMuted: string; textSecondary: string };
  placeholder: string;
  hint: string;
}) {
  const bad = !!time && !TIME_RE.test(time);
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={s.fieldRow}>
        <TouchableOpacity
          style={[s.control, s.dateControl, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onPick}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={[s.controlText, { color: date ? colors.textPrimary : colors.textMuted }]}>
            {date || placeholder}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={[
            s.control,
            s.timeControl,
            { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: bad ? COLORS.error : colors.border },
          ]}
          value={time}
          onChangeText={onTime}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </View>
      {!!date && !time && <Text style={[s.hint, { color: colors.textMuted }]}>{hint}</Text>}
    </View>
  );
}

export function AttendanceEditSheet({
  entry,
  visible,
  onClose,
  onSaved,
}: {
  entry: TimeEntry | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (updated: TimeEntry) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  const tz = useMemo(
    () =>
      (entry as unknown as { timezone?: string | null })?.timezone ??
      (entry as unknown as { location?: { timezone?: string | null } })?.location?.timezone ??
      undefined,
    [entry],
  );

  const [inDate, setInDate] = useState('');
  const [inTime, setInTime] = useState('');
  const [outDate, setOutDate] = useState('');
  const [outTime, setOutTime] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState<'in' | 'out' | null>(null);
  const today = useMemo(() => new Date(), []);
  const [saving, setSaving] = useState(false);

  // Reload the form from the entry each time it opens, so a cancelled edit
  // leaves nothing behind for the next one.
  useEffect(() => {
    if (!visible || !entry) return;
    const start = splitWall(utcToZonedInput(entry.clockInAt, tz));
    const end = splitWall(utcToZonedInput(entry.clockOutAt, tz));
    setInDate(start.date);
    setInTime(start.time);
    setOutDate(end.date);
    setOutTime(end.time);
    setNotes(entry.notes ?? '');
    setReason('');
  }, [visible, entry, tz]);

  const inWall = joinWall(inDate, inTime);
  const outWall = joinWall(outDate, outTime);
  const timesValid = TIME_RE.test(inTime) && (!outTime || TIME_RE.test(outTime));
  /*
    A shift cannot end before it starts.

    Checked here as well as on the server because the phone can say so while the
    person is still typing, and the alternative is a round trip that comes back
    with a refusal they could have been shown.
  */
  const orderOk =
    !outWall || new Date(zonedInputToUtc(outWall, tz)).getTime() > new Date(zonedInputToUtc(inWall, tz)).getTime();
  const canSave = !!entry && timesValid && orderOk && reason.trim().length >= 3 && !saving;

  const save = useCallback(async () => {
    if (!entry || !canSave) return;
    setSaving(true);
    try {
      const updated = await attendanceApi.editEntry(entry.id, {
        clockInAt: inWall ? zonedInputToUtc(inWall, tz) : undefined,
        clockOutAt: outWall ? zonedInputToUtc(outWall, tz) : undefined,
        notes: notes.trim() || undefined,
        timezone: tz || undefined,
        reason: reason.trim(),
      });
      toast.success(t('attendanceReview.edit.saved'));
      onSaved(updated);
      onClose();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('attendanceReview.edit.failed'));
    } finally {
      setSaving(false);
    }
  }, [entry, canSave, inWall, outWall, notes, reason, tz, onSaved, onClose, t, toast]);

  return (
    <>
      <BlurSheet visible={visible} onClose={onClose}>
        <SheetPanel title={t('attendanceReview.edit.title')} onClose={onClose} closeDisabled={saving}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Which clock these times belong to — never the reader's own. */}
            <Text style={[s.zone, { color: colors.textMuted }]}>
              {tz
                ? t('attendanceReview.edit.inZone', { zone: cityFromTz(tz) || tz })
                : t('attendanceReview.edit.deviceZone')}
            </Text>

            <TimeField
              label={t('attendanceReview.edit.clockIn')}
              date={inDate}
              time={inTime}
              onTime={setInTime}
              onPick={() => setPicking('in')}
              colors={colors}
              placeholder={t('attendanceReview.edit.pickDate')}
              hint={t('attendanceReview.edit.timeHint')}
            />
            <TimeField
              label={t('attendanceReview.edit.clockOut')}
              date={outDate}
              time={outTime}
              onTime={setOutTime}
              onPick={() => setPicking('out')}
              colors={colors}
              placeholder={t('attendanceReview.edit.pickDate')}
              hint={t('attendanceReview.edit.timeHint')}
            />
            {!orderOk && (
              <Text style={[s.error, { color: COLORS.error }]}>{t('attendanceReview.edit.endBeforeStart')}</Text>
            )}

            <View style={s.field}>
              <Text style={[s.label, { color: colors.textSecondary }]}>{t('attendanceReview.edit.notes')}</Text>
              <TextInput
                style={[s.area, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('attendanceReview.edit.notesPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: colors.textSecondary }]}>
                {t('attendanceReview.edit.reason')} <Text style={{ color: COLORS.error }}>*</Text>
              </Text>
              <TextInput
                style={[s.area, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={reason}
                onChangeText={setReason}
                placeholder={t('attendanceReview.edit.reasonPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <Text style={[s.hint, { color: colors.textMuted }]}>{t('attendanceReview.edit.reasonHint')}</Text>
            </View>

            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: canSave ? COLORS.primary : colors.border }]}
              onPress={save}
              disabled={!canSave}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.saveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SheetPanel>
      </BlurSheet>

      <DatePickerModal
        visible={picking !== null}
        selectedDate={dateFromISO(picking === 'out' ? outDate : inDate)}
        onSelect={(d) => {
          if (picking === 'out') setOutDate(isoFromDate(d));
          else setInDate(isoFromDate(d));
          setPicking(null);
        }}
        onClear={() => {
          // Clearing the END is how an entry is put back to "still running";
          // a shift with no START is not a thing, so that one only moves.
          if (picking === 'out') {
            setOutDate('');
            setOutTime('');
          }
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
        // A shift that has not happened yet cannot be corrected.
        maxDate={today}
        title={t(picking === 'out' ? 'attendanceReview.edit.clockOut' : 'attendanceReview.edit.clockIn')}
      />
    </>
  );
}

const s = StyleSheet.create({
  zone: { fontSize: FONT_SIZE.xs, marginBottom: SPACING.md },
  field: { marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.xs },
  fieldRow: { flexDirection: 'row', gap: SPACING.sm },
  control: {
    height: 44, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.base,
  },
  dateControl: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  controlText: { fontSize: FONT_SIZE.base },
  timeControl: { width: 96, textAlign: 'center' },
  area: {
    minHeight: 70, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, fontSize: FONT_SIZE.base, textAlignVertical: 'top',
  },
  hint: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  error: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },
  saveBtn: { paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACING.sm },
  saveText: { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
});
