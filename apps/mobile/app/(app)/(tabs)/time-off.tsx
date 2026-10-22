import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { hasAccessModule, moduleAnywhere, type DetectedRequest, type LeaveType, type RequestKind } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { mayReadTeamAvailability } from '@/lib/permissions';
import { useToast } from '@/island/island-context';
import { useTheme } from '@/contexts/theme-context';
import { useMyTimeOff } from '@/features/time/use-my-time-off';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { useTourScroll, TourTarget } from '@/features/tour';
import { availabilityApi, type AvailabilityResponse } from '@/lib/api';
import type { ActionOutcome } from '@/offline/actions/outcome';
import { useTimeFormat } from '@/hooks/use-time-format';
import { useResponsive } from '@/lib/responsive';
import { centeredContent } from '@/components/screen-container';
import { Ground, PrimaryButton, ScreenHeader, useTabSafe } from '@/components/amazen';
import {
  availabilityInsights as insightsFor, datesWithStatus, filterRequests, getDayCount, mondayDow,
  scheduleDayMap, timeOffStats, toDateString, type RequestFilter,
} from '@/features/time-off/helpers';
import {
  daysNotAnswered,
  mapLimited,
  mergeAvailability,
  planAvailabilityFetch,
  rangeUnsupported,
} from '@/features/time-off/availability-plan';
import { TimeOffStatsRow, ScheduleNotSetBanner } from '@/features/time-off/stats-row';
import { TimeOffCalendarCard } from '@/features/time-off/calendar-card';
import { TeamAvailabilityPanel } from '@/features/time-off/availability-panel';
import { TimeOffRequestForm } from '@/features/time-off/request-form';
import { TimeOffRequestsList } from '@/features/time-off/requests-list';
import { KindChooserSheet, RequestDetailSheet, type RequestRowData } from '@/features/requests/request-parts';
import { RequestFormCard } from '@/features/requests/request-form-card';
import { draftToBody, type RequestBody } from '@/features/requests/request-model';
import { useRequestOptions } from '@/features/requests/use-request-options';
import { useRequestsScreen } from "@/features/requests/use-requests-screen";

/**
 * REQUESTS — everything a member asks the person responsible for them: leave
 * (on the month, as always), working remotely, a changed day, overtime agreed
 * in advance, or anything else in words. Four figures, New request, the month,
 * and the list of requests of every kind.
 *
 * The route keeps its old file name (`time-off`) so every push tap, deep link
 * and the calendar's "New › Time off" still land here; only the words changed.
 *
 * The pieces live in `src/components/time-off/` (leave) and
 * `src/components/requests/` (every kind); their rules are plain functions
 * there and tested on their own.
 */
export default function RequestsScreen() {
  const {
    amazen,
    c,
    tabSafe,
    t,
    locale,
    wide,
    requests,
    schedule,
    isLoading,
    isRefreshing,
    error,
    fetchData,
    options,
    offered,
    leaveOffered,
    otherKinds,
    today,
    tourScroll,
    viewYear,
    viewMonth,
    rangeStart,
    rangeEnd,
    isSelecting,
    isLoadingAvailability,
    availabilityError,
    leaveType,
    setLeaveType,
    notes,
    setNotes,
    isSubmitting,
    chooserOpen,
    setChooserOpen,
    formKind,
    setFormKind,
    formInitial,
    setFormInitial,
    requestFilter,
    setRequestFilter,
    detail,
    setDetail,
    scheduleDays,
    approvedDates,
    pendingDates,
    spaceName,
    handleRefresh,
    canSeeTeamAvailability,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    handleDayPress,
    clearSelection,
    availabilityInsights,
    send,
    submitLeave,
    applySuggestion,
    pickKind,
    withdraw,
    stats,
    filteredRequests,
    hasRangeSelected,
    rangeDays,
  } = useRequestsScreen();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('requests.title', 'Requests')} style={wide ?? undefined} />
      <ScrollView
        {...tourScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // ⚠️ Room for the floating tab pill — it reserves no layout of its own.
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingBottom: tabSafe + amazen.space(6), gap: amazen.space(3) },
          wide,
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[c.accent]} tintColor={c.accent} />}
      >
        <TimeOffStatsRow stats={stats} />

        {schedule.length === 0 && leaveOffered ? <ScheduleNotSetBanner /> : null}

        <TourTarget name="timeoff-request" style={{ gap: amazen.space(3) }}>
          {otherKinds.length > 0 && !formKind ? (
            <PrimaryButton label={t('requests.new', 'New request')} onPress={() => setChooserOpen(true)} />
          ) : null}

          {formKind ? (
            <RequestFormCard
              kind={formKind}
              options={options}
              busy={isSubmitting}
              onClose={() => { setFormKind(null); setFormInitial(null); }}
              onSubmit={(body) => void send(body, () => { setFormKind(null); setFormInitial(null); })}
              initial={formInitial}
              onSuggest={applySuggestion}
            />
          ) : leaveOffered ? (
            <TimeOffCalendarCard
              today={today}
              viewYear={viewYear}
              viewMonth={viewMonth}
              onPrevMonth={goToPrevMonth}
              onNextMonth={goToNextMonth}
              onToday={goToToday}
              scheduleLength={schedule.length}
              scheduleDays={scheduleDays}
              approvedDates={approvedDates}
              pendingDates={pendingDates}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              isSelecting={isSelecting}
              onDayPress={handleDayPress}
            />
          ) : null}
        </TourTarget>

        {!formKind && hasRangeSelected && canSeeTeamAvailability ? (
          <TeamAvailabilityPanel
            loading={isLoadingAvailability}
            failed={availabilityError}
            insights={availabilityInsights}
            locale={locale}
          />
        ) : null}

        {!formKind && hasRangeSelected ? (
          <TimeOffRequestForm
            rangeStart={rangeStart!}
            rangeEnd={rangeEnd!}
            rangeDays={rangeDays}
            leaveType={leaveType}
            onLeaveType={setLeaveType}
            notes={notes}
            onNotes={setNotes}
            isSubmitting={isSubmitting}
            onClear={clearSelection}
            onSubmit={submitLeave}
          />
        ) : null}

        <View style={{ height: amazen.space(1) }} />

        <TimeOffRequestsList
          requests={filteredRequests}
          filter={requestFilter}
          onFilter={setRequestFilter}
          onOpen={setDetail}
          spaceName={spaceName}
        />
      </ScrollView>

      <KindChooserSheet visible={chooserOpen} kinds={offered} onPick={pickKind} onClose={() => setChooserOpen(false)} />
      <RequestDetailSheet request={detail} spaceName={spaceName(detail?.spaceId)} onClose={() => setDetail(null)} onWithdraw={withdraw} />
    </Ground>
  );
}
