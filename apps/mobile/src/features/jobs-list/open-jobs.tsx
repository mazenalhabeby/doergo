import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, Eyebrow } from '@/components/amazen';
import { HANDOVER_NOTE_MAX, formatDuration } from '@hbcfield/shared/client';
import type { HandoverJob } from '@/lib/api';

/** OpenJobs, moved here unchanged out of clock-out-sheet.tsx. */
/**
 * JOBS STILL IN WORK — they pause at the clock-out minute, unless the crew
 * carries on (somebody else who joined is still on the clock: shared crew.ts).
 * There the note is for the people still on it.
 *
 * ⚠️ AN OFFER, NEVER A GATE (rule 1). Each job may take a note of what was done
 * and what is left; the button works with none, and a job left without one is
 * asked for later ("Write what you did on …"), never held against the clock-out.
 */
export function OpenJobs({
  jobs, notes, onNote, onFinish,
}: {
  jobs: HandoverJob[];
  notes: Record<string, string>;
  onNote: (taskId: string, text: string) => void;
  onFinish?: (taskId: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const [open, setOpen] = useState<string | null>(jobs.length === 1 ? jobs[0]!.id : null);
  return (
    <View style={{ marginTop: amazen.space(4), gap: amazen.space(2) }}>
      <Eyebrow tone={jobs.every((j) => j.crewContinues) ? 'onGlass' : 'warn'}>
        {jobs.every((j) => j.crewContinues) ? t('shiftEnd.jobs.eyebrowCrew') : t('shiftEnd.jobs.eyebrow', { count: jobs.length })}
      </Eyebrow>
      {jobs.map((j) => {
        const writing = open === j.id;
        // "Working 2h 15m" — your own share, only time on the clock (shared tasks/job-time.ts).
        const sub = [
          j.workedMinutes ? t('shiftEnd.jobs.working', { time: formatDuration(j.workedMinutes) }) : null,
          j.customer?.name,
          j.locationAddress,
        ]
          .filter(Boolean)
          .join(' · ');
        // The crew carries on: nothing pauses — a note here is for the people still on it.
        const carriesOn = !!j.crewContinues;
        return (
          <View
            key={j.id}
            style={{
              backgroundColor: c.tile,
              borderRadius: amazen.radius.field,
              padding: amazen.space(3),
              gap: amazen.space(2),
            }}>
            <View>
              <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{j.title}</AText>
              {sub ? <AText variant="caption" tone="muted" numberOfLines={1}>{sub}</AText> : null}
              {carriesOn ? <AText variant="caption" tone="accent" numberOfLines={2}>{t('shiftEnd.jobs.crewCarriesOn')}</AText> : null}
              {j.myOpenItems ? (
                <AText variant="caption" tone="warn" numberOfLines={2}>
                  {t('shiftEnd.jobs.myOpenItems', { count: j.myOpenItems })}
                </AText>
              ) : null}
            </View>
            {writing ? (
              <TextInput
                value={notes[j.id] ?? ''}
                onChangeText={(text) => onNote(j.id, text)}
                multiline
                maxLength={HANDOVER_NOTE_MAX}
                placeholder={t('job.handover.placeholder')}
                placeholderTextColor={c.inkMuted}
                style={{
                  backgroundColor: c.sunken,
                  borderRadius: amazen.radius.field,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.lineField,
                  paddingHorizontal: amazen.space(3),
                  paddingVertical: amazen.space(2.5),
                  color: c.inkStrong,
                  fontFamily: amazen.font.sans,
                  fontSize: 14.5,
                  minHeight: 76,
                  textAlignVertical: 'top',
                }}
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: amazen.space(4) }}>
              {!writing ? (
                <Pressable onPress={() => setOpen(j.id)} accessibilityRole="button" hitSlop={8}>
                  <AText variant="caption" tone="accent">
                    {notes[j.id]?.trim()
                      ? t('shiftEnd.jobs.editNote')
                      : carriesOn
                        ? t('shiftEnd.jobs.noteForCrew')
                        : t('shiftEnd.jobs.leaveNote')}
                  </AText>
                </Pressable>
              ) : null}
              {onFinish ? (
                <Pressable onPress={() => onFinish(j.id)} accessibilityRole="button" hitSlop={8}>
                  <AText variant="caption" tone="ink">{t('shiftEnd.jobs.finish')}</AText>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
      <AText variant="caption" tone="muted">{t('shiftEnd.jobs.hint')}</AText>
    </View>
  );
}
