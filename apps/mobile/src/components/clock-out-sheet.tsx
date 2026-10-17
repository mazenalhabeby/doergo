import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from '../hooks/useTimeFormat';
import { useTheme } from '../contexts/theme-context';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { AText, Eyebrow, LiveDot } from './amazen';
import { SheetConfirmFooter } from './sheet-confirm-footer';
import { heroParts } from './home/shift-state';
import { readClockOut, type ClockOutShift } from './home/clock-out-state';
import { formatDistance } from '../lib/distance';
import { HANDOVER_NOTE_MAX, formatDuration } from '@hbcfield/shared/client';
import type { HandoverJob } from '../lib/api';
import { EARLY_REASONS, Hero, Hatch, Row, Strip } from './clock-out-sheet-shared';
import { type ClockOutSheetProps } from './clock-out-sheet-props';
import { OpenJobs } from './open-jobs';
import { Bar } from './bar';
import { Receipt } from './receipt';

export function ClockOutSheet({ visible, onClose, onConfirm, isLoading = false, shift, openJobs = [], onFinishJob }: ClockOutSheetProps) {
  // Jobs the crew carries on are not paused by this clock-out — only the rest are counted on the button.
  const pausing = openJobs.filter((j) => !j.crewContinues).length;
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /*
    ⚠️ THE SAME CLOCK AS THE CARD THIS CAME OUT OF. The receipt is what the
    member signs off; if the sheet renders `15:00` where the card said
    `3:00 PM`, the two disagree about the shift in the one place it is being
    confirmed. `useTimeFormat` reads the member's own 12h/24h choice and the
    organization's timezone, so neither surface decides for itself.
  */
  const clockOf = useTimeFormat().formatTime;

  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [earlyReason, setEarlyReason] = useState<string | null>(null);
  const [jobNotes, setJobNotes] = useState<Record<string, string>>({});

  const view = useMemo(() => readClockOut(shift), [shift]);
  const late = view.face === 'late';
  const early = view.face === 'early';

  const close = useCallback(() => {
    setNotes(''); setNoteOpen(false); setEarlyReason(null); setJobNotes({});
    onClose();
  }, [onClose]);

  const confirm = useCallback(() => {
    if (isLoading) return;
    const body = {
      notes: notes.trim() || undefined,
      /*
        ⚠️ PICKING NONE STILL CLOCKS OUT. The chips are an offer, not a
        question — a member who does not want to say why is clocking out, and
        the reason column stays null.
      */
      earlyReason: early && earlyReason ? t(`shiftEnd.reasons.${earlyReason}`, { defaultValue: earlyReason }) : undefined,
      /*
        ⚠️ ③ ASKS FOR THE EXTRA TIME, AND THE CLOCK-OUT HAPPENS EITHER WAY.
        The reason is the request; its absence is not a refusal to clock out.
      */
      overtimeReason: late
        ? t('shiftEnd.overtimeReason', {
            duration: formatDuration(view.overBy),
            defaultValue: `${formatDuration(view.overBy)} past the rostered end`,
          })
        : undefined,
    };
    const handovers = openJobs
      .map((j) => ({ taskId: j.id, note: (jobNotes[j.id] ?? '').trim() }))
      .filter((h) => h.note);
    setNotes(''); setNoteOpen(false); setEarlyReason(null); setJobNotes({});
    onConfirm(handovers.length ? { ...body, handovers } : body);
  }, [isLoading, notes, early, earlyReason, late, view.overBy, onConfirm, t, openJobs, jobNotes]);

  const eyebrow = late
    ? t('shiftEnd.pastEnd', { defaultValue: 'PAST YOUR SHIFT END' })
    : early
      ? t('shiftEnd.finishingEarly', { at: shift.workspace ?? '', defaultValue: `FINISHING EARLY AT ${shift.workspace ?? ''}` })
      : t('shiftEnd.finishingAt', { at: shift.workspace ?? '', defaultValue: `FINISHING AT ${shift.workspace ?? ''}` });

  return (
    <BlurSheet visible={visible} onClose={close}>
      {/*
        ⚠️ THE SAME PANEL AS EVERY OTHER SHEET. It used to roll its own glass
        surface, and glass is see-through: the card's buttons showed through
        the receipt (06.png) while the Report sheet beside it was solid. One
        surface, one component.
      */}
      <SheetPanel onClose={close}>
        {/*
          ⚠️ THE BODY SCROLLS, THE BUTTONS DO NOT. Away from the site, a job still
          in work and an open note box together are taller than a phone, and
          SheetPanel only CAPS the height — the jade button was clipped off the
          bottom with nothing to scroll it back.
        */}
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* The eyebrow says WHERE. You have not left the card; it has opened. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
          <LiveDot color={late || early ? c.warn : c.accent} live={false} />
          <Eyebrow tone={late || early ? 'warn' : 'muted'}>{eyebrow}</Eyebrow>
        </View>

        {/*
          The hero says WHAT YOU DID — ⚠️ the same figure in the same setting as
          the card it came from, so the number they were watching is the number
          they are signing off.
        */}
        <View style={{ marginTop: amazen.space(3) }}>
          <Hero minutes={shift.countedMinutes} warn={late || early} />
          <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {t('shiftEnd.counted', { defaultValue: 'counted' })}
          </AText>
        </View>

        <Bar view={view} shift={shift} clockOf={clockOf} />

        {/* ④ — recorded, never refused. */}
        {view.away ? (
          <Strip tone="warn">
            {t('shiftEnd.away', {
              distance: formatDistance(view.away.metres),
              at: shift.workspace ?? '',
              who: shift.approver ?? t('shiftEnd.yourApprover', { defaultValue: 'your approver' }),
              defaultValue: `You are ${formatDistance(view.away.metres)} from ${shift.workspace ?? ''}. The clock-out works — ${shift.approver ?? 'your approver'} will see where it happened.`,
            })}
          </Strip>
        ) : null}

        <Receipt view={view} shift={shift} clockOf={clockOf} />

        {/*
          ② — the chips. ⚠️ `WHY, IF YOU WANT TO SAY · OPTIONAL` says the whole
          contract in the label: it is an offer, and picking none still clocks
          out.
        */}
        {early ? (
          <>
            <Eyebrow tone="muted" style={{ marginTop: amazen.space(4) }}>
              {t('shiftEnd.whyOptional', { defaultValue: 'WHY, IF YOU WANT TO SAY · OPTIONAL' })}
            </Eyebrow>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2), marginTop: amazen.space(2) }}>
              {EARLY_REASONS.map((k) => {
                const on = earlyReason === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setEarlyReason(on ? null : k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => ({
                      paddingVertical: amazen.space(2),
                      paddingHorizontal: amazen.space(3.5),
                      borderRadius: amazen.radius.full,
                      backgroundColor: c.tile,
                      borderWidth: 1.5,
                      borderColor: on ? c.inkStrong : 'transparent',
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <AText variant="caption" tone={on ? 'strong' : 'muted'}>
                      {t(`shiftEnd.reasons.${k}`, { defaultValue: k })}
                    </AText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ③ — what the button is about to ask for. */}
        {late ? (
          <Strip tone="warn">
            {t('shiftEnd.askApproval', {
              who: shift.approver ?? t('shiftEnd.yourApprover', { defaultValue: 'your approver' }),
              duration: formatDuration(view.overBy),
              defaultValue: `This asks ${shift.approver ?? 'your approver'} to approve ${formatDuration(view.overBy)} of extra time. You are clocked out either way.`,
            })}
          </Strip>
        ) : null}

        {openJobs.length ? (
          <OpenJobs
            jobs={openJobs}
            notes={jobNotes}
            onNote={(id, text) => setJobNotes((n) => ({ ...n, [id]: text }))}
            onFinish={onFinishJob ? (id) => { close(); onFinishJob(id); } : undefined}
          />
        ) : null}

        {/*
          ⚠️ COLLAPSED, AND MARKED OPTIONAL. A 500-character box with a counter
          is a wall of blank at the moment somebody wants to go home.
        */}
        {noteOpen ? (
          <TextInput
            value={notes}
            onChangeText={setNotes}
            autoFocus
            multiline
            maxLength={500}
            placeholder={t('shiftEnd.addNote', { defaultValue: 'Add a note' })}
            placeholderTextColor={c.inkMuted}
            style={{
              marginTop: amazen.space(4),
              backgroundColor: c.sunken,
              borderRadius: amazen.radius.field,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.lineField,
              paddingHorizontal: amazen.space(4),
              paddingVertical: amazen.space(3),
              color: c.inkStrong,
              fontFamily: amazen.font.sans,
              fontSize: 15,
              height: 88,
              textAlignVertical: 'top',
            }}
          />
        ) : (
          <Pressable
            onPress={() => setNoteOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center',
              marginTop: amazen.space(4),
              backgroundColor: c.tile,
              borderRadius: amazen.radius.field,
              paddingVertical: amazen.space(3),
              paddingHorizontal: amazen.space(4),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AText variant="caption" tone="ink">
              {`＋  ${t('shiftEnd.addNote', { defaultValue: 'Add a note' })}`}
            </AText>
            <View style={{ flex: 1 }} />
            <AText variant="caption" tone="muted">
              {t('shiftEnd.optional', { defaultValue: 'optional' })}
            </AText>
          </Pressable>
        )}

        </ScrollView>

        {/* ⚠️ One jade button that nothing disables, and Cancel as a text line — rule 1 (see the footer). */}
        <SheetConfirmFooter
          label={late
            ? t('shiftEnd.clockOutAndAsk', { defaultValue: 'Clock out & ask' })
            : pausing
              ? t('shiftEnd.pauseAndClockOut', { count: pausing })
              : t('home.fullTime.clockOut')}
          onConfirm={confirm}
          onCancel={close}
          isLoading={isLoading}
        />
      </SheetPanel>
    </BlurSheet>
  );
}

