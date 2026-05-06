"use client"

import { useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, MapPin, Users, ArrowRight } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, locationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  WorkspaceGrid,
  ActivityPanel,
  type WorkspaceBoxProps,
  type PersonNodeProps,
  type WorkerStatus,
  type LiveEvent,
  type PendingAction,
} from "@/components/dashboard"
import { ActivityPanelToggle } from "@/components/activity-panel-toggle"
import { getGreeting } from "./helpers"

// Gradient colors for worker avatars
const AVATAR_COLORS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ef4444, #dc2626)",
  "linear-gradient(135deg, #ec4899, #db2777)",
  "linear-gradient(135deg, #8b5cf6, #a855f7)",
  "linear-gradient(135deg, #14b8a6, #0d9488)",
]

function getInitials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getStatusFromTask(taskStatus: string): WorkerStatus {
  switch (taskStatus) {
    case "IN_PROGRESS":
    case "EN_ROUTE":
    case "ARRIVED":
      return "busy"
    case "BLOCKED":
      return "late"
    default:
      return "on"
  }
}

function getTagFromTask(taskStatus: string): PersonNodeProps["tag"] {
  switch (taskStatus) {
    case "IN_PROGRESS":
      return { text: "Working", variant: "task" }
    case "EN_ROUTE":
      return { text: "En Route", variant: "task" }
    case "ARRIVED":
      return { text: "On Site", variant: "task" }
    case "BLOCKED":
      return { text: "Blocked", variant: "miss" }
    default:
      return undefined
  }
}

export function ClientDashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()

  const handleEditLocation = useCallback((locationId: string) => {
    router.push(`/locations?edit=${locationId}`)
  }, [router])

  const handleAssignWorkers = useCallback((locationId: string) => {
    router.push(`/locations?assign=${locationId}`)
  }, [router])

  // Fetch tasks
  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(),
  })

  // Fetch company locations
  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
  })

  const tasks = tasksData?.data || []
  const locations = locationsData?.data || []

  // Build workspace boxes from locations + task data
  const workspaceBoxes: WorkspaceBoxProps[] = useMemo(() => {
    // Group tasks by location address (or "Unassigned" if none)
    const locationGroups = new Map<string, typeof tasks>()

    for (const task of tasks) {
      const loc = task.locationAddress || "Unassigned"
      if (!locationGroups.has(loc)) {
        locationGroups.set(loc, [])
      }
      locationGroups.get(loc)!.push(task)
    }

    // Also group by status for workspace context
    const activeTasks = tasks.filter(t =>
      ["IN_PROGRESS", "EN_ROUTE", "ARRIVED", "BLOCKED"].includes(t.status)
    )
    const pendingTasksList = tasks.filter(t =>
      ["NEW", "ASSIGNED", "ACCEPTED"].includes(t.status)
    )
    const completedTasksList = tasks.filter(t =>
      ["COMPLETED", "CLOSED"].includes(t.status)
    )

    // Build person nodes for active workers
    const activeWorkerMap = new Map<string, PersonNodeProps>()
    for (const task of activeTasks) {
      if (task.assignedTo && !activeWorkerMap.has(task.assignedTo.id)) {
        const colorIdx = hashString(task.assignedTo.id) % AVATAR_COLORS.length
        activeWorkerMap.set(task.assignedTo.id, {
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: getStatusFromTask(task.status),
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
          tag: getTagFromTask(task.status),
        })
      }
    }

    const pendingWorkerMap = new Map<string, PersonNodeProps>()
    for (const task of pendingTasksList) {
      if (task.assignedTo && !pendingWorkerMap.has(task.assignedTo.id) && !activeWorkerMap.has(task.assignedTo.id)) {
        const colorIdx = hashString(task.assignedTo.id) % AVATAR_COLORS.length
        pendingWorkerMap.set(task.assignedTo.id, {
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: "on" as WorkerStatus,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
          tag: { text: `${tasks.filter(t => t.assignedToId === task.assignedTo?.id && ["NEW", "ASSIGNED", "ACCEPTED"].includes(t.status)).length} pending`, variant: "hrs" },
        })
      }
    }

    const boxes: WorkspaceBoxProps[] = []

    // Fixed location boxes — from company locations API
    for (const loc of locations) {
      if (!loc.isActive) continue
      // Find workers currently at this location (from active tasks)
      const locPeople: PersonNodeProps[] = []
      for (const task of activeTasks) {
        if (task.assignedTo && task.locationAddress?.includes(loc.name)) {
          const colorIdx = hashString(task.assignedTo.id) % AVATAR_COLORS.length
          if (!locPeople.find(p => p.name.startsWith(task.assignedTo!.firstName))) {
            locPeople.push({
              initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
              color: AVATAR_COLORS[colorIdx]!,
              status: getStatusFromTask(task.status),
              name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
              tag: getTagFromTask(task.status),
            })
          }
        }
      }
      boxes.push({
        title: loc.name,
        type: "fixed",
        people: locPeople,
        totalAssigned: locPeople.length,
        locationId: loc.id,
        onEdit: handleEditLocation,
        onAssign: handleAssignWorkers,
      })
    }

    // Location-based boxes from task addresses (dynamic — only if not already a fixed location)
    for (const [location, locTasks] of locationGroups) {
      if (location === "Unassigned") continue

      const allLocWorkerIds = new Set(
        locTasks.filter(t => t.assignedTo).map(t => t.assignedTo!.id)
      )
      const activeLocTasks = locTasks.filter(t =>
        ["IN_PROGRESS", "EN_ROUTE", "ARRIVED"].includes(t.status)
      )

      const people: PersonNodeProps[] = []
      const seenIds = new Set<string>()
      for (const task of activeLocTasks) {
        if (task.assignedTo && !seenIds.has(task.assignedTo.id)) {
          seenIds.add(task.assignedTo.id)
          const colorIdx = hashString(task.assignedTo.id) % AVATAR_COLORS.length
          people.push({
            initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
            color: AVATAR_COLORS[colorIdx]!,
            status: getStatusFromTask(task.status),
            name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
            tag: getTagFromTask(task.status),
          })
        }
      }

      const shortLoc = location.length > 20
        ? location.split(",")[0] || location.slice(0, 20)
        : location

      boxes.push({
        title: shortLoc,
        type: "fixed",
        people,
        totalAssigned: allLocWorkerIds.size,
      })
    }

    // On Task (dynamic — workers actively working)
    if (activeWorkerMap.size > 0) {
      boxes.push({
        title: "On Task",
        type: "dynamic",
        people: Array.from(activeWorkerMap.values()),
      })
    }

    // Off Duty (dynamic — completed workers)
    const completedPeople: PersonNodeProps[] = []
    const completedIds = new Set<string>()
    for (const task of completedTasksList) {
      if (task.assignedTo && !completedIds.has(task.assignedTo.id)) {
        completedIds.add(task.assignedTo.id)
        const colorIdx = hashString(task.assignedTo.id) % AVATAR_COLORS.length
        completedPeople.push({
          initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
          color: AVATAR_COLORS[colorIdx]!,
          status: "off" as WorkerStatus,
          name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
        })
      }
    }
    if (completedPeople.length > 0) {
      boxes.push({
        title: "Off Duty",
        type: "dynamic",
        people: completedPeople,
      })
    }

    return boxes
  }, [tasks, locations])

  // Build live events from recent task activity
  const liveEvents: LiveEvent[] = useMemo(() => {
    return tasks.slice(0, 8).map((task, i) => {
      const name = task.assignedTo
        ? `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`
        : "Unassigned"
      const dotMap: Record<string, LiveEvent["dot"]> = {
        IN_PROGRESS: "green",
        EN_ROUTE: "blue",
        ARRIVED: "green",
        COMPLETED: "blue",
        BLOCKED: "red",
        ASSIGNED: "amber",
        NEW: "purple",
      }
      const actionMap: Record<string, string> = {
        IN_PROGRESS: "started",
        EN_ROUTE: "en route to",
        ARRIVED: "arrived at",
        COMPLETED: "completed",
        BLOCKED: "blocked on",
        ASSIGNED: "assigned to",
        NEW: "created",
      }
      return {
        id: task.id,
        dot: dotMap[task.status] || "blue" as LiveEvent["dot"],
        message: <><strong>{name}</strong> {actionMap[task.status] || "updated"} <strong>{task.title}</strong></>,
        time: "just now",
      }
    })
  }, [tasks])

  // Build pending actions from tasks that need attention
  const pendingActions: PendingAction[] = useMemo(() => {
    return tasks
      .filter(t => t.status === "BLOCKED" || t.status === "NEW")
      .slice(0, 5)
      .map((task, i) => {
        const name = task.assignedTo
          ? `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`
          : "Unassigned"
        const initials = task.assignedTo
          ? getInitials(task.assignedTo.firstName, task.assignedTo.lastName)
          : "?"
        const colorIdx = hashString(task.assignedTo?.id || "x") % AVATAR_COLORS.length
        return {
          id: task.id,
          initials,
          color: AVATAR_COLORS[colorIdx]!,
          title: `${name} - ${task.status === "BLOCKED" ? "Blocked" : "New Task"}`,
          description: task.title,
          onApprove: () => {},
          onReject: task.status === "BLOCKED" ? () => {} : undefined,
        }
      })
  }, [tasks])

  const greeting = getGreeting()
  const hasFixedLocations = workspaceBoxes.some(b => b.type === "fixed")

  // Empty state — no fixed locations created
  if (!hasFixedLocations) {
    return (
      <div className="flex flex-1 items-center justify-center relative overflow-hidden min-h-[calc(100vh-4rem)]">
        {/* Layer 1: Gradient blobs */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
          {[
            { w:500, h:500, bg:'#3b82f6', x:'-5%', y:'-10%', anim:'tileFloat1', dur:'18s', blur:120 },
            { w:450, h:450, bg:'#8b5cf6', x:'50%', y:'50%',  anim:'tileFloat3', dur:'20s', blur:120 },
            { w:400, h:400, bg:'#10b981', x:'60%', y:'-5%',  anim:'tileFloat2', dur:'22s', blur:100 },
          ].map((blob, i) => (
            <div key={i} className="absolute rounded-full" style={{ width:blob.w, height:blob.h, background:blob.bg, left:blob.x, top:blob.y, filter:`blur(${blob.blur}px)`, animation:`${blob.anim} ${blob.dur} ease-in-out infinite` }} />
          ))}
        </div>

        {/* Layer 2: Popup workspace boxes with connection lines */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Popup workspace boxes — circle around center */}
          {(() => {
            const boxes = [
              { w:130, h:90, delay:'0.3s', avatars:[
                { color:'#10b981', in:4, out:12, dur:16 },
                { color:'#3b82f6', in:6, out:14, dur:18 },
              ]},
              { w:140, h:90, delay:'0.7s', avatars:[
                { color:'#8b5cf6', in:3, out:11, dur:15 },
                { color:'#f59e0b', in:7, out:13, dur:17 },
                { color:'#10b981', in:9, out:16, dur:19 },
              ]},
              { w:120, h:90, delay:'1.1s', avatars:[
                { color:'#3b82f6', in:5, out:10, dur:14 },
              ]},
              { w:130, h:90, delay:'1.5s', avatars:[
                { color:'#ec4899', in:4, out:9,  dur:13 },
                { color:'#06b6d4', in:8, out:15, dur:18 },
              ]},
              { w:140, h:90, delay:'1.9s', avatars:[
                { color:'#f59e0b', in:3, out:8,  dur:12 },
                { color:'#8b5cf6', in:6, out:11, dur:14 },
                { color:'#ef4444', in:10, out:16, dur:17 },
              ]},
              { w:120, h:90, delay:'2.3s', avatars:[
                { color:'#06b6d4', in:5, out:13, dur:16 },
              ]},
            ]
            const count = boxes.length
            const radius = 42
            return boxes.map((box, i) => {
              const angle = (i * 360 / count) - 90
              const rad = (angle * Math.PI) / 180
              const cx = 50 + radius * Math.cos(rad)
              const cy = 50 + radius * Math.sin(rad)
              return { ...box, x: `${cx}%`, y: `${cy}%`, angle }
            })
          })().map((box, i) => (
            <div
              key={i}
              className="absolute rounded-2xl border border-foreground/[0.06] bg-card/50 backdrop-blur-md -translate-x-1/2 -translate-y-1/2 shadow-lg shadow-black/10"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                animation: `boxPopIn 0.6s cubic-bezier(0.34,1.56,0.64,1) ${box.delay} both`,
              }}
            >
              {/* Title bar skeleton */}
              <div className="flex items-center gap-1.5 px-3 pt-2.5">
                <div className="h-1.5 w-12 rounded-full bg-foreground/[0.08]" />
                <div className="h-1.5 w-5 rounded-full bg-foreground/[0.05] ml-auto" />
              </div>
              {/* Avatars */}
              <div className="flex items-center justify-center gap-2 pt-3 pb-2">
                {box.avatars.map((av, j) => (
                  <div
                    key={j}
                    className="w-7 h-7 rounded-full"
                    style={{
                      background: av.color,
                      boxShadow: `0 0 10px ${av.color}25`,
                      animation: `avatarClockIn ${av.dur}s ease-in-out ${av.in}s infinite`,
                    }}
                  />
                ))}
              </div>
              {/* Name skeletons */}
              <div className="flex items-center justify-center gap-3 px-3 pb-2">
                {box.avatars.map((_, j) => (
                  <div key={j} className="h-1 w-6 rounded-full bg-foreground/[0.05]" />
                ))}
              </div>
            </div>
          ))}

        </div>

        {/* Content */}
        <div className="relative text-center max-w-md space-y-10 z-10 px-6">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight leading-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              Your workspace<br />is ready
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
              Add locations, invite your team, and see everyone — wherever they are — in one live view.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 h-12 px-6 text-sm shadow-lg shadow-primary/25">
              <Link href="/locations">
                <Plus className="h-4 w-4" />
                Create Location
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 h-12 px-6 text-sm">
              <Link href="/technicians">
                <Users className="h-4 w-4" />
                Add Workers
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
              <Link href="/locations">
                <Plus className="h-3.5 w-3.5" />
                New Space
              </Link>
            </Button>
            <ActivityPanelToggle />
          </div>
        </div>

        {/* Workspace Grid */}
        <WorkspaceGrid boxes={workspaceBoxes} />
      </div>

      {/* Right Activity Panel */}
      <ActivityPanel events={liveEvents} pending={pendingActions} />
    </div>
  )
}
