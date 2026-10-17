import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  hasAccessModule,
  moduleAnywhere,
  type DetectedRequest,
  type LeaveType,
  type RequestKind,
} from "@hbcfield/shared/client";
import { useAuth } from "../../../contexts/auth-context";
import { mayReadTeamAvailability } from "../../../lib/permissions";
import { useToast } from "../../../island/island-context";
import { useTheme } from "../../../contexts/theme-context";
import { useMyTimeOff } from "../../../components/time/use-my-time-off";
import { useTourScroll } from "../../../components/tour";
import { availabilityApi, type AvailabilityResponse } from "../../../lib/api";
import type { ActionOutcome } from "../../../offline/actions/outcome";
import { useTimeFormat } from "../../../hooks/useTimeFormat";
import { useResponsive } from "../../../lib/responsive";
import { centeredContent } from "../../../components/screen-container";
import { useTabSafe } from "../../../components/amazen";
import {
  availabilityInsights as insightsFor,
  datesWithStatus,
  filterRequests,
  getDayCount,
  mondayDow,
  scheduleDayMap,
  timeOffStats,
  toDateString,
  type RequestFilter,
} from "../../../components/time-off/helpers";
import {
  daysNotAnswered,
  mapLimited,
  mergeAvailability,
  planAvailabilityFetch,
  rangeUnsupported,
} from "../../../components/time-off/availability-plan";
import { type RequestRowData } from "../../../components/requests/request-parts";
import { draftToBody, type RequestBody } from "../../../components/requests/request-model";
import { useRequestOptions } from "../../../components/requests/use-request-options";
import { useRequestsScreenData } from "./use-requests-screen-data";
import { useRequestsScreenData2 } from "./use-requests-screen-data2";

/** RequestsScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestsScreen() {
  const {
    user,
    amazen,
    c,
    tabSafe,
    toast,
    t,
    locale,
    wide,
    leave,
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
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    isSelecting,
    setIsSelecting,
    availabilityCache,
    isLoadingAvailability,
    availabilityError,
    leaveType,
    setLeaveType,
    notes,
    setNotes,
    isSubmitting,
    setIsSubmitting,
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
  } = useRequestsScreenData2();

  const availabilityInsights = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return insightsFor(rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id);
  }, [rangeStart, rangeEnd, availabilityCache, scheduleDays, schedule.length, user?.id]);

  // =========================================================================
  // SENDING
  // =========================================================================

  /** One path for every kind: the outbox carries the body unchanged, with or without signal. */
  const send = async (body: RequestBody, after: () => void) => {
    try {
      setIsSubmitting(true);
      const outcome: ActionOutcome = await leave.request(body);
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.requestForm.failedToSubmit'));
        return;
      }
      after();
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(t('common.success'), t('timeOff.requestForm.successMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLeave = () => {
    if (!user?.id || !rangeStart || !rangeEnd) return;
    const built = draftToBody({ kind: 'LEAVE', startDate: toDateString(rangeStart), endDate: toDateString(rangeEnd), type: leaveType, reason: notes });
    if (!built.ok) { toast.error(t('common.error'), t(`offline.errors.${built.code}`)); return; }
    void send(built.body, clearSelection);
  };

  /**
   * "Other" words that read as something the app has a form for: open THAT
   * form with what was read, the words kept as the reason. Nothing is sent.
   */
  const applySuggestion = (sug: DetectedRequest, words: string) => {
    const reason = words.trim();
    const offeredKind = (k: RequestKind) => !offered || offered.includes(k);
    if (sug.kind === 'LEAVE' && leaveOffered) {
      setFormKind(null); setFormInitial(null);
      const first = sug.startDate ?? toDateString(today);
      setRangeStart(new Date(`${first}T12:00:00`));
      setRangeEnd(new Date(`${sug.endDate ?? first}T12:00:00`));
      setIsSelecting(false);
      setLeaveType(sug.leaveType ?? 'VACATION');
      setNotes(reason);
      return;
    }
    if (sug.kind === 'EXPENSE' && moduleAnywhere(user as never, 'assets')) {
      router.push('/(app)/asset-expense' as never);
      return;
    }
    // More time today is asked on the running shift, from the clock.
    if (sug.kind === 'EXTRA_TIME' && hasAccessModule(user as never, 'clock')) {
      toast.info(t('requests.detect.askOnClock'));
      router.navigate('/(app)/(tabs)/attendance' as never);
      return;
    }
    const kind = sug.kind === 'EXTRA_TIME' ? 'OVERTIME' : sug.kind;
    if (kind === 'REMOTE' || kind === 'HOURS' || kind === 'OVERTIME') {
      if (!offeredKind(kind)) { toast.info(t('requests.detect.notOffered')); return; }
      setFormInitial({ start: sug.startDate, end: sug.endDate, startTime: sug.startTime, endTime: sug.endTime, minutes: sug.minutes, reason });
      setFormKind(kind);
    }
  };

  /*
    Opened from the Time tab's "Ask for more time" (`?ask=OVERTIME`): the overtime form for
    today, filled in. Adopted once the options are known, then cleared.
  */
  const askParam = useLocalSearchParams<{ ask?: string | string[] }>().ask;
  useEffect(() => {
    if (askParam !== 'OVERTIME' || !options) return;
    router.setParams({ ask: '' });
    if (offered && !offered.includes('OVERTIME')) { toast.info(t('requests.detect.notOffered')); return; }
    clearSelection();
    setFormInitial({ start: toDateString(today), minutes: 60 });
    setFormKind('OVERTIME');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askParam, options]);

  const pickKind = (kind: RequestKind) => {
    setChooserOpen(false);
    if (kind === 'LEAVE') { setFormKind(null); return; }
    clearSelection();
    setFormInitial(null);
    setFormKind(kind);
  };

  const withdraw = async (request: RequestRowData) => {
    const outcome = await leave.cancel(request.id);
    if (outcome.kind === 'refused') {
      throw new Error((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.failedToCancel'));
    }
    if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
  };

  // =========================================================================
  // DERIVED
  // =========================================================================

  const stats = useMemo(() => timeOffStats(requests, today), [requests, today]);
  const filteredRequests = useMemo(() => filterRequests(requests, requestFilter, today), [requests, requestFilter, today]);
  const hasRangeSelected = rangeStart !== null && rangeEnd !== null;
  const rangeDays = hasRangeSelected ? getDayCount(toDateString(rangeStart!), toDateString(rangeEnd!)) : 0;

  return {
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
  };
}
