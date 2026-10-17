"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { employeesApi, type TimeOffStatus } from "@/lib/api"
import { useRouteAccess } from "@/hooks/use-route-access"
import { keys, invalidateTimeOff } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"

export interface TimeOffTabProps {
  employeeId: string
  employeeName: string
  canManage: boolean
}

/** TimeOffTab's state and handlers — everything before its markup, moved here unchanged. */
export function useTimeOffTab({ employeeId, employeeName, canManage }: Pick<TimeOffTabProps, 'employeeId' | 'employeeName' | 'canManage'>) {
  const { t } = useTranslation()
  const { formatDate } = useTimeFormat()
  const queryClient = useQueryClient()
  // Adjusting a balance is deciding leave: the gate the server puts on approving it
  // (@RequirePermissionInSpace('canManageRota')); the ledger's own `canEdit` narrows it per person.
  const canAdjust = useRouteAccess().holds("any:canManageRota")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [createOpen, setCreateOpen] = useState(false)

  // Create form state
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState("")

  const { data: timeOffRequests, isLoading } = useQuery({
    queryKey: keys.timeOff.member(employeeId, statusFilter === "all" ? undefined : statusFilter),
    queryFn: () =>
      employeesApi.getTimeOff(
        employeeId,
        statusFilter === "all"
          ? undefined
          : (statusFilter as TimeOffStatus)
      ),
    enabled: !!employeeId,
    staleTime: 30_000, // avoid refetching on every tab re-open
  })

  const requestMutation = useMutation({
    mutationFn: (data: {
      startDate: string
      endDate: string
      reason?: string
    }) => employeesApi.requestTimeOff(employeeId, data),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      setCreateOpen(false)
      setDateRange(undefined)
      setReason("")
      notify.success(t('technicians.timeOffTab.submittedSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(serverErrorMessage(error, t) || t('technicians.timeOffTab.failedToSubmit'))
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (timeOffId: string) =>
      employeesApi.cancelTimeOff(timeOffId),
    onSuccess: () => {
      invalidateTimeOff(queryClient, employeeId)
      notify.success(t('technicians.timeOffTab.canceledSuccessfully'))
    },
    onError: (error: Error) => {
      notify.error(serverErrorMessage(error, t) || t('technicians.timeOffTab.failedToCancel'))
    },
  })

  const handleCreateSubmit = () => {
    if (!dateRange?.from || !dateRange?.to) {
      notify.error(t('validation.pleaseSelectDateRange'))
      return
    }
    requestMutation.mutate({
      startDate: format(dateRange.from, "yyyy-MM-dd"),
      endDate: format(dateRange.to, "yyyy-MM-dd"),
      reason: reason || undefined,
    })
  }

  return {
    t,
    formatDate,
    canAdjust,
    statusFilter,
    setStatusFilter,
    createOpen,
    setCreateOpen,
    dateRange,
    setDateRange,
    reason,
    setReason,
    timeOffRequests,
    isLoading,
    requestMutation,
    cancelMutation,
    handleCreateSubmit,
  }
}

/** What TimeOffTab and its sections read. */
export type TimeOffTabState = ReturnType<typeof useTimeOffTab>
