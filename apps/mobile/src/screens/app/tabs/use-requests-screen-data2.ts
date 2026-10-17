import { mondayDow } from "../../../components/time-off/helpers";
import { useRequestsScreenData } from "./use-requests-screen-data";

/** useRequestsScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestsScreenData2() {
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
    setViewYear,
    viewMonth,
    setViewMonth,
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
  } = useRequestsScreenData();

  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
  };
  const goToToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const handleDayPress = (date: Date) => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return;
    const isScheduled = schedule.length === 0 || scheduleDays[mondayDow(date)] === true;
    if (!isScheduled) return;
    setFormKind(null);
    if (!isSelecting || !rangeStart) {
      setRangeStart(date);
      setRangeEnd(null);
      setIsSelecting(true);
    } else {
      const start = date < rangeStart ? date : rangeStart;
      const end = date < rangeStart ? rangeStart : date;
      setRangeStart(start);
      setRangeEnd(end);
      setIsSelecting(false);
    }
  };

  const clearSelection = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setIsSelecting(false);
    setLeaveType('VACATION');
    setNotes('');
  };

  return {
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
  };
}
