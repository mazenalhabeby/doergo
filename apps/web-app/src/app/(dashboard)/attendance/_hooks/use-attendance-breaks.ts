"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { attendanceApi, type BreakType } from "@/lib/api"

/** The Breaks tab's reads: the chosen day and type, who is on a break now, the history, the summary. */
export function useAttendanceBreaks(canAccess: boolean, activeTab: "tracking" | "breaks" | "noshows") {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Breaks state
  const [breakDate, setBreakDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("all")

  // Fetch active breaks
  const {
    data: activeBreaks = [],
    isLoading: loadingActiveBreaks,
    refetch: refetchActiveBreaks,
  } = useQuery({
    queryKey: keys.attendance.activeBreaks(),
    queryFn: () => attendanceApi.getActiveBreaks(),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
    refetchInterval: activeTab === "breaks" ? 30_000 : false, // live: who's on break now
  })

  // Fetch break history
  const {
    data: breakHistoryData,
    isLoading: loadingBreakHistory,
    refetch: refetchBreakHistory,
  } = useQuery({
    queryKey: keys.attendance.breakHistory(breakDate, breakTypeFilter),
    queryFn: () =>
      attendanceApi.getBreakHistory({
        date: breakDate,
        type: breakTypeFilter !== "all" ? (breakTypeFilter as BreakType) : undefined,
        limit: 50,
      }),
    enabled: canAccess && activeTab === "breaks",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  // Fetch break summary for the selected date
  const { data: breakSummary, isLoading: loadingBreakSummary } = useQuery({
    queryKey: keys.attendance.breakSummary(breakDate),
    queryFn: () =>
      attendanceApi.getBreakSummary({
        startDate: breakDate,
        endDate: breakDate,
      }),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
  })

  // End break mutation
  const endBreakManually = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes?: string }) =>
      attendanceApi.endBreakManually(breakId, notes),
    onSuccess: () => {
      notify.success(t("attendance.toast.breakEnded"))
      queryClient.invalidateQueries({ queryKey: keys.attendance.activeBreaks() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.breakHistory() })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t("attendance.toast.breakEndFailed"))
    },
  })

  return {
    breakDate,
    setBreakDate,
    breakTypeFilter,
    setBreakTypeFilter,
    activeBreaks,
    loadingActiveBreaks,
    refetchActiveBreaks,
    breakHistoryData,
    loadingBreakHistory,
    refetchBreakHistory,
    breakSummary,
    loadingBreakSummary,
    endBreakManually,
  }
}
