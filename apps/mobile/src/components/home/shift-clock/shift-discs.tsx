import React from 'react';
import type { TFunction } from 'i18next';
import type { Href, Router } from 'expo-router';
import { Disc } from '../../amazen';
import { BreakGlyph, ClockOutGlyph, IssueMineGlyph, IssueNewGlyph } from '../../glyphs/shift-glyphs';
import type { readShiftState } from '../shift-state';

type ShiftState = ReturnType<typeof readShiftState>;

/**
 * The disc row's discs, for the three states that have a ROW: ②, ③/④ and ⑦.
 * The card decides WHETHER there is a row; this decides what is in it.
 */
export function shiftDiscs({
  st, t, live, resting, working, entryId, unread, router, onSetRealTime,
  startRest, endRest, setClockOutAt, setBreakOpen, setReportOpen, setListOpen,
}: {
  st: ShiftState;
  t: TFunction;
  live: boolean;
  resting: boolean;
  working: boolean;
  entryId: string | undefined;
  unread: number;
  router: Pick<Router, 'push'>;
  onSetRealTime?: () => void;
  startRest: (input?: { ruleId?: string }) => Promise<void>;
  endRest: () => Promise<void>;
  setClockOutAt: (at: Date) => void;
  setBreakOpen: (open: boolean) => void;
  setReportOpen: (open: boolean) => void;
  setListOpen: (open: boolean) => void;
}): React.ReactNode[] {
  const report = (
    <Disc
      key="report"
      Glyph={IssueNewGlyph}
      label={t('issues.reportShort', { defaultValue: 'Report' })}
      /* Nothing to file against without a shift — §4 sends `timeEntryId`. */
      disabled={!entryId}
      onPress={() => setReportOpen(true)}
    />
  );
  const mine = (
    <Disc
      key="mine"
      Glyph={IssueMineGlyph}
      label={t('issues.myIssuesShort', { defaultValue: 'My issues' })}
      /* ⚠️ Unread, never a total. `Disc` renders nothing at 0. */
      badge={unread}
      onPress={() => setListOpen(true)}
    />
  );

  if (st.kind === 'unconfirmed') {
    return [
      <Disc
        key="fix"
        Glyph={ClockOutGlyph}
        label={t('shiftClock.setRealTime', { defaultValue: 'Set the real time' })}
        filled
        onPress={onSetRealTime ?? (() => router.push('/(app)/(tabs)/attendance' as Href))}
      />,
      mine,
    ];
  }

  if (live || resting) {
    return [
      /*
        ④ ⚠️ THE ONLY PLACE IN THE CATALOGUE WHERE THE FILLED DISC IS NOT THE
        OBVIOUS ONE. Clock out is still one tap away; it is simply not what is
        being offered, because a rest that is already late is the thing that
        has to happen next.
      */
      st.kind === 'restOverdue' ? (
        <Disc
          key="take"
          Glyph={BreakGlyph}
          label={t('shiftClock.startRest', { defaultValue: 'Start the rest' })}
          filled
          disabled={working}
          onPress={() => void startRest({ ruleId: st.nextRest?.ruleId })}
        />
      ) : null,
      resting ? (
        <Disc
          key="end"
          Glyph={BreakGlyph}
          label={t('shiftClock.endRest', { defaultValue: 'End the rest' })}
          filled
          disabled={working}
          onPress={() => void endRest()}
        />
      ) : null,
      <Disc
        key="out"
        Glyph={ClockOutGlyph}
        label={t('home.fullTime.clockOut')}
        /* Filled in ② only — ③ and ④ have their own primary. */
        filled={st.kind === 'working'}
        disabled={working}
        onPress={() => setClockOutAt(new Date())}
      />,
      st.kind === 'working' ? (
        <Disc
          key="break"
          Glyph={BreakGlyph}
          label={t('shiftClock.break', { defaultValue: 'Break' })}
          disabled={working}
          onPress={() => setBreakOpen(true)}
        />
      ) : null,
      report,
      mine,
    ].filter(Boolean);
  }

  /*
    Clocked out never reaches here — see the card's clock-in pill. This answers
    for the three states that have a ROW: ②, ③/④ and ⑦.
  */
  return [report, mine];
}
