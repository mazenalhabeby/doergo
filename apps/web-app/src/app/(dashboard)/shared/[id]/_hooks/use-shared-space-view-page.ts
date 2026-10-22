"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { spaceSharingApi, locationsApi, attendanceApi, trackingApi, type TimeEntry } from "@/lib/api"

/** A shared workspace as its guest sees it: the share, what it allows, and the sections the owner turned on. */
export function useSharedSpaceViewPage() {
  const params = useParams()
  const spaceId = params.id as string
  const { user } = useAuth()

  // The share (and its capabilities / scope) is already in the auth context — no
  // extra fetch. workers/attendance/tracking are gated by show* flags for a later
  // phase; v1 renders the read-only board + (optionally) request-more.
  const share = user?.access?.sharedSpaces?.find((s) => s.spaceId === spaceId)
  // Capabilities for THIS space (from the server-resolved grant): CONTRIBUTE/CONTROL
  // can create; CONTROL can assign. Drives the direct-control UI (backend enforces).
  const perSpace = user?.access?.perSpace?.[spaceId] ?? {}
  const canCreate = !!perSpace.canCreateTasks
  const canAssign = !!perSpace.canAssignTasks
  const canManageMembers = !!perSpace.canManageWorkspaces || !!perSpace.canManageUsers // CONTROL → add own workers to the space

  const [requestOpen, setRequestOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [addWorkerOpen, setAddWorkerOpen] = useState(false)

  const { data: myRequests } = useQuery({
    queryKey: keys.sharedSpaces.requests(spaceId),
    queryFn: () => spaceSharingApi.listGuestRequests(spaceId),
    enabled: !!share,
  })

  // Workers on this space — only when the owner enabled "show workers".
  const { data: workers } = useQuery({
    queryKey: keys.sharedSpaces.workers(spaceId),
    queryFn: () => locationsApi.getAssignedMembers(spaceId),
    enabled: !!share && !!share.showWorkers,
  })

  // Attendance — only when the owner enabled "show attendance".
  const { data: attendance } = useQuery({
    queryKey: keys.sharedSpaces.attendance(spaceId),
    queryFn: () => attendanceApi.getLocationEntries(spaceId, { limit: 50 }),
    enabled: !!share && !!share.showAttendance,
  })
  const attendanceEntries: TimeEntry[] = attendance?.data ?? []

  // Live worker locations — only when the owner enabled "show tracking".
  const { data: tracked } = useQuery({
    queryKey: keys.sharedSpaces.tracking(spaceId),
    queryFn: () => trackingApi.getSpaceWorkers(spaceId),
    enabled: !!share && !!share.showTracking,
    refetchInterval: share?.showTracking ? 30_000 : false,
  })

  // The auth context surfaces the share by spaceId but not its share id, which the
  // "request more" POST targets — resolve it once from /shared-spaces.
  const { data: sharedSpaces } = useQuery({
    queryKey: keys.sharedSpaces.list(),
    queryFn: () => spaceSharingApi.listSharedSpaces(),
    enabled: !!share,
  })
  const shareId = sharedSpaces?.find((s) => s.spaceId === spaceId)?.id ?? ""

  return {
    spaceId,
    share,
    canCreate,
    canAssign,
    canManageMembers,
    requestOpen,
    setRequestOpen,
    createOpen,
    setCreateOpen,
    addWorkerOpen,
    setAddWorkerOpen,
    myRequests,
    workers,
    attendanceEntries,
    tracked,
    shareId,
  }
}

type SharedSpaceViewState = ReturnType<typeof useSharedSpaceViewPage>
/** The share as the auth context carries it. */
export type SharedSpace = NonNullable<SharedSpaceViewState["share"]>
/** One assignment on the shared workspace, from "show workers". */
export type SharedSpaceWorker = NonNullable<SharedSpaceViewState["workers"]>[number]
