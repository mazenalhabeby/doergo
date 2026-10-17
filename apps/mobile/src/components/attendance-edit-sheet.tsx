import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { utcToZonedInput, zonedInputToUtc, localDateKey } from '@hbcfield/shared/client';
import { useTheme } from '../contexts/theme-context';
import { useToast } from '../island/island-context';
import { attendanceApi } from '../lib/api';
import type { TimeEntry } from '../lib/api/types';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { cityFromTz } from '../lib/utils';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { DatePickerModal } from './date-picker-modal';
import { splitWall, joinWall, dateFromISO, TIME_RE, TimeField, s } from './time-field';
import { caught } from '../lib/caught';

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
    } catch (err: unknown) {
      toast.error(t('common.error'), caught(err).message || t('attendanceReview.edit.failed'));
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
                style={[
                  s.area,
                  { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                ]}
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
                style={[
                  s.area,
                  { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                ]}
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
          if (picking === 'out') setOutDate(localDateKey(d));
          else setInDate(localDateKey(d));
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
