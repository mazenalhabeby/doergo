import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '../../hooks/use-now';
import { RefreshControl, ScrollView, View } from 'react-native';
import { getFix } from '../../lib/location-fix';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn, hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { useResponsive } from '../../lib/responsive';
import { attendanceApi, overtimeApi, type OvertimeRequest, type TimeEntry } from '../../lib/api';
import { refusalText } from '../../lib/distance';
import { hhmmIn, leaveTimeFrom } from '../../offline/attendance/leave-time';
import { useShift, useShiftActions } from '../../offline/attendance/use-shift';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopGeofence } from '../../services/background-geofence';
import { Ground, ScreenHeader, Well, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { ApproveGlyph } from '../glyphs/glyphs';
import { ShiftClockCardView } from '../home/shift-clock-card';
import { scheduleFor, totalsRevision } from '../home/shift-state';
import { useScheduleTotals } from '../home/use-schedule-totals';
import { TimePickerModal } from '../time-picker-modal';
import { TourTarget, useTourScroll } from '../tour';
import { TimeBanners, TimeLink } from './time-banners';
import { TimeHistory } from './time-history';
import { noShiftHere, placesView } from './time-logic';
import { TimeOffSection } from './time-off-section';
import { TimePlaces } from './time-places';
import { TimeAutoClock } from './time-auto-clock';
import { TimeToday } from './time-today';
import { TimeWeek } from './time-week';
import { useMyTimeOff } from './use-my-time-off';
import { useShiftWatch } from './use-shift-watch';
import { useTimeScreen } from './use-time-screen';

/**
 * THE TIME TAB — built on the home's Shift clock card.
 *
 * ⚠️ THE CARD IS THE SAME COMPONENT AS THE HOME WIDGET, with every state and
 * every sheet it opens (clock in, rests, clock out, report, my issues). The
 * home and this page can never disagree about the shift, because there is one
 * drawing of it. This page adds what does not fit on a widget: where you work,
 * today as a timeline with its work log, the week, time off, recent shifts.
 *
 * ⚠️ ONE COPY OF THE SHIFT FOR THE WHOLE PAGE. `useShift` is called here and
 * handed to the card (`ShiftClockCardView`) and the timeline — two calls are
 * two loads and two answers that can disagree for a frame. Same for the
 * week's totals: asked once here, handed to the card.
 *
 * ⚠️ THE GROUND AND THE HEADER ARE THE SHARED ONES — the home's gradient and
 * `ScreenHeader`, whose avatar is its own business. No screen passes it.
 */
export function TimeScreen() {
  const {
    amazen,
    c,
    t,
    router,
    tabSafe,
    now,
    shift,
    status,
    entry,
    actions,
    totals,
    watch,
    hasShiftScheduling,
    canApproveExtraTime,
    recent,
    overtime,
    waiting,
    timeOffOn,
    leave,
    requestOpen,
    setRequestOpen,
    tiles,
    noShift,
    askMoreTime,
    busy,
    unconfirmed,
    unconfirmedTz,
    leavePicker,
    setLeavePicker,
    confirmLeaveTime,
    resolveForgot,
    requestExtra,
    issueId,
    refreshing,
    onRefresh,
    runningMinutes,
    finishedToday,
    wide,
    tourScroll,
  } = useTimeScreen();

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('tabs.attendance')}
        tour={{ title: 'attendance-header' }}
        actions={timeOffOn ? [{ label: t('time.off.title', 'Time off'), onPress: () => setRequestOpen(true), tourKey: 'attendance-timeoff' }] : undefined}
        style={wide ?? undefined}
      />
      <ScrollView
        {...tourScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.accent} colors={[c.accent]} />}
      >
        <OfflineBanner />

        <TimeBanners
          status={status}
          breaks={shift.breaks}
          watch={watch}
          overtime={overtime}
          hasShiftScheduling={hasShiftScheduling}
          busy={busy}
          onForgot={(at) => void resolveForgot(at)}
          onRequestExtra={() => void requestExtra()}
          onChanged={() => void shift.refresh()}
          noShiftHere={noShift}
        />

        <TourTarget name="attendance-clock">
          <ShiftClockCardView
            shift={shift}
            linkToTime={false}
            onSetRealTime={unconfirmed ? () => setLeavePicker(true) : undefined}
            openIssueId={issueId ?? null}
            totals={totals}
            noShift={noShift}
            onAskMoreTime={askMoreTime}
          />
        </TourTarget>

        <TourTarget name="attendance-places">
          <TimePlaces tiles={tiles} />
        </TourTarget>

        <TimeAutoClock />

        <TourTarget name="attendance-status">
          <TimeToday running={entry} finished={finishedToday} breaks={shift.breaks?.todayBreaks ?? []} />
        </TourTarget>

        <TourTarget name="attendance-week">
          <TimeWeek weekDays={totals.weekDays} runningMinutes={runningMinutes} monthMinutes={totals.monthMinutes} now={now} />
        </TourTarget>

        {timeOffOn ? (
          <TourTarget name="attendance-leave">
            <TimeOffSection leave={leave} requestOpen={requestOpen} setRequestOpen={setRequestOpen} now={now} />
          </TourTarget>
        ) : null}

        <TourTarget name="attendance-history">
          <TimeHistory entries={recent} now={now} />
        </TourTarget>

        {canApproveExtraTime ? (
          <Well style={{ padding: amazen.space(3) }}>
            <TimeLink
              Glyph={ApproveGlyph}
              label={t('shiftReminder.openEntryPoint')}
              hint={t('shiftReminder.openEntryPointDesc')}
              badge={waiting}
              onPress={() => router.push('/(app)/approvals?kind=extraTime' as Href)}
            />
          </Well>
        ) : null}
        <View style={{ height: amazen.space(2) }} />
      </ScrollView>

      {unconfirmed ? (
        <TimePickerModal
          visible={leavePicker}
          value={hhmmIn(new Date(unconfirmed.clockOutAt), unconfirmedTz ?? 'UTC')}
          title={t('attendance.unconfirmed.pickerTitle')}
          onClose={() => setLeavePicker(false)}
          onClear={() => setLeavePicker(false)}
          onSelect={(hhmm) => void confirmLeaveTime(hhmm)}
        />
      ) : null}
    </Ground>
  );
}
