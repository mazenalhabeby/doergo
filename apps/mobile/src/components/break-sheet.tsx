import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BreakType, type BreakPlanItem } from '@hbcfield/shared/client';
import { useTheme } from '../contexts/theme-context';
import { useTimeFormat } from '../hooks/useTimeFormat';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { AText, Eyebrow } from './amazen';

/**
 * WHICH BREAK IS THIS?
 *
 * ⚠️ IT ASKS, AND IT NEVER INSISTS. The Break disc used to start a rest
 * immediately, which is the right default and a poor answer when somebody
 * wants their lunch recorded as lunch. So the sheet offers the three and the
 * button works whatever is picked — including nothing, which is exactly the
 * old behaviour: the server then satisfies whichever planned rest is next.
 *
 * ⚠️ THE TYPE IS A LABEL, NOT A PRICE, AND THE SHEET MUST NOT IMPLY OTHERWISE.
 * Whether a rest comes off the counted time is decided by the PLAN — the
 * server copies `isPaid` from the planned rest it matches (`break.service.ts`),
 * never from `type`. Picking `Lunch` changes what the timesheet CALLS it, not
 * what it costs, which is why this sheet says what the rest will be rather
 * than asking the member to choose it.
 *
 * ⚠️ THE REASON ON `Other` IS OPTIONAL. A field that gates the button would be
 * the clock-out bug again in a smaller place: a person may always take their
 * break, and a time system that argues about it is one people work around.
 */
export interface BreakSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `type` and `notes` are both optional — see the notes above. */
  onStart: (input: { type?: BreakType; notes?: string }) => void;
  isLoading?: boolean;
  /**
   * The planned rest this will satisfy, when the shift has a plan.
   *
   * Shown because it is the fact the member cannot otherwise see: how long the
   * rest is, and whether it counts. The card knows it already — it is the same
   * `nextRest` the caption reads — so nothing is fetched for this.
   */
  planned?: BreakPlanItem | null;
}

/**
 * ⚠️ THE SHARED ENUM, NOT A SECOND LIST OF THE SAME THREE NAMES. A local copy
 * is a fourth kind waiting to be added on one side only.
 */
const KINDS = [BreakType.LUNCH, BreakType.SHORT, BreakType.OTHER] as const;

export function BreakSheet({ visible, onClose, onStart, isLoading = false, planned }: BreakSheetProps) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const clockOf = useTimeFormat().formatTime;

  const [kind, setKind] = useState<BreakType | null>(null);
  const [reason, setReason] = useState('');

  const close = useCallback(() => { setKind(null); setReason(''); onClose(); }, [onClose]);

  const start = useCallback(() => {
    if (isLoading) return;
    const body = {
      type: kind ?? undefined,
      /*
        ⚠️ THE REASON TRAVELS AS `notes`, AND ONLY ON `Other`. The break record
        has no reason column — `notes` is where a member's own words about a
        rest belong, and it is the field the attendance screen already shows.
      */
      notes: kind === BreakType.OTHER && reason.trim() ? reason.trim() : undefined,
    };
    setKind(null); setReason('');
    onStart(body);
  }, [isLoading, kind, reason, onStart]);

  return (
    <BlurSheet visible={visible} onClose={close}>
      <SheetPanel onClose={close}>
        <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>
          {t('attendance.breaks.takeABreak', { defaultValue: 'Take a break' })}
        </AText>

        {/*
          What the rest actually IS, when the plan says. `30m · does not count,
          due 11:00` is the thing a member cannot work out from the card, and
          saying it here is why the three choices below can stay a label.
        */}
        {planned ? (
          <AText variant="caption" tone="muted" style={{ marginTop: 3 }}>
            {[
              t('shiftClock.restOf', {
                duration: `${planned.durationMinutes}m`,
                defaultValue: `${planned.durationMinutes}m`,
              }),
              planned.isPaid
                ? t('shiftClock.restCounts', { defaultValue: 'counts as worked' })
                : t('shiftClock.restDoesNotCount', { defaultValue: 'does not count' }),
              t('shiftClock.restDue', {
                time: clockOf(planned.dueAt),
                defaultValue: `rest due ${clockOf(planned.dueAt)}`,
              }),
            ].join(' · ')}
          </AText>
        ) : null}

        <Eyebrow tone="muted" style={{ marginTop: amazen.space(5) }}>
          {t('shiftClock.whatKind', { defaultValue: 'WHAT KIND · OPTIONAL' })}
        </Eyebrow>

        {/*
          ⚠️ NEUTRAL, ALL THREE. None of them is a variance and none is a
          warning — a coloured pill here would say one break is worse than
          another. Selection is an outline and full-strength ink, the same
          language the clock-out sheet's reasons use.
        */}
        <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: amazen.space(2) }}>
          {KINDS.map((k) => {
            const on = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(on ? null : k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: amazen.space(3),
                  borderRadius: amazen.radius.full,
                  backgroundColor: c.tile,
                  borderWidth: 1.5,
                  borderColor: on ? c.inkStrong : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AText variant="body" tone={on ? 'strong' : 'muted'}>
                  {t(`attendance.breaks.${k.toLowerCase()}`, { defaultValue: k })}
                </AText>
              </Pressable>
            );
          })}
        </View>

        {/*
          ⚠️ THE FIELD APPEARS ONLY FOR `Other`, AND IT IS OPTIONAL. `Lunch` and
          `Short` say what they are; `Other` is the one that does not, so it is
          the only one worth a sentence — and a box on screen for all three
          would be a prompt nobody asked for at the moment they want to stop.
        */}
        {kind === BreakType.OTHER ? (
          <TextInput
            value={reason}
            onChangeText={setReason}
            autoFocus
            multiline
            maxLength={200}
            placeholder={t('shiftClock.breakReason', { defaultValue: 'What is it for? (optional)' })}
            placeholderTextColor={c.inkMuted}
            style={{
              marginTop: amazen.space(3),
              backgroundColor: c.sunken,
              borderRadius: amazen.radius.field,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: c.lineField,
              paddingHorizontal: amazen.space(4),
              paddingVertical: amazen.space(3),
              color: c.inkStrong,
              fontFamily: amazen.font.sans,
              fontSize: 15,
              height: 72,
              textAlignVertical: 'top',
            }}
          />
        ) : null}

        {/*
          ⚠️ NOTHING BLOCKS IT. With no kind picked this is exactly what the
          Break disc did before the sheet existed: the server satisfies the
          planned rest that is next. The sheet is an offer, not a gate.
        */}
        <Pressable
          onPress={start}
          disabled={isLoading}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: amazen.space(5),
            paddingVertical: amazen.space(3.5),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentSolid,
            opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
            {t('shiftClock.startBreak', { defaultValue: 'Start the break' })}
          </AText>
        </Pressable>

        {/* Cancel is a text line — the same weight rule as the clock-out sheet. */}
        <Pressable onPress={close} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center', marginTop: amazen.space(3) }}>
          <AText variant="caption" tone="muted">
            {t('shiftEnd.notYet', { defaultValue: 'Not yet' })}
          </AText>
        </Pressable>
      </SheetPanel>
    </BlurSheet>
  );
}
