"use client"

import { personName } from "@hbcfield/shared/client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format, differenceInCalendarDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  CalendarOff,
  Plus,
  MoreHorizontal,
  CalendarDays,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"

import { useTimeFormat } from "@/hooks"

import {
  employeesApi,
  type TimeOffStatus,
} from "@/lib/api"
import { useRouteAccess } from "@/hooks/use-route-access"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { keys, invalidateTimeOff } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import { isAbsence, requestDetail } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import { LeaveLedgerPanel } from "@/components/leave/leave-ledger-panel"
import Link from "next/link"
import { Inbox } from "lucide-react"
import { useTimeOffTab, type TimeOffTabProps } from "./use-time-off-tab"
import { STATUS_PILLS, getDurationDays } from "./time-off-tab-helpers"
import { TimeOffTabTimeOffTab } from "./time-off-tab-time-off-tab"

export function TimeOffTab({ employeeId, employeeName, canManage }: TimeOffTabProps) {
  const vm = useTimeOffTab({ employeeId, employeeName, canManage })
  const {
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
  } = vm

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <LeaveLedgerPanel memberId={employeeId} memberName={employeeName} canAdjust={canAdjust} />
      </div>
      <TimeOffTabTimeOffTab vm={vm} canManage={canManage} />

    </>
  )
}
