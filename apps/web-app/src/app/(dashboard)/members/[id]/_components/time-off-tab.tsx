"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import { LeaveLedgerPanel } from "@/components/leave/leave-ledger-panel"
import { employeesApi, type TimeOffStatus } from "@/lib/api"
import { useRouteAccess } from "@/hooks/use-route-access"
import { keys } from "@/lib/query-keys"
import { TimeOffRequests } from "./time-off-requests"

export interface TimeOffTabProps {
  employeeId: string
  employeeName: string
  canManage: boolean
}

/** The member page's Time off tab: the leave balance, then their requests. */
export function TimeOffTab({ employeeId, employeeName, canManage }: TimeOffTabProps) {
  // Adjusting a balance is deciding leave: the gate the server puts on approving it
  // (@RequirePermissionInSpace('canManageRota')); the ledger's own `canEdit` narrows it per person.
  const canAdjust = useRouteAccess().holds("any:canManageRota")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data: timeOffRequests, isLoading } = useQuery({
    queryKey: keys.timeOff.member(employeeId, statusFilter === "all" ? undefined : statusFilter),
    queryFn: () =>
      employeesApi.getTimeOff(employeeId, statusFilter === "all" ? undefined : (statusFilter as TimeOffStatus)),
    enabled: !!employeeId,
    staleTime: 30_000, // avoid refetching on every tab re-open
  })

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
      <TimeOffRequests
        employeeId={employeeId}
        canManage={canManage}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        timeOffRequests={timeOffRequests}
      />
    </>
  )
}
