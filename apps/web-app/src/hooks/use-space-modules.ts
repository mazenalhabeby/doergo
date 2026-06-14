"use client"

import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi, workflowsApi, type WorkflowStatus } from "@/lib/api"
import { MOCK_SPACES } from "@/app/(dashboard)/tasks/_components/mock-data"

// ─── Mock workflows with default modules per workflow type ──────────────────
// Workflow defines which modules are available by default.
// Space can override (add or remove) individual modules.

interface MockWorkflow {
  name: string
  defaultModules: string[]
  statuses: WorkflowStatus[]
}

const MOCK_SPACE_WORKFLOWS: Record<string, MockWorkflow> = {
  "loc-main": {
    name: "Office",
    defaultModules: ["subtasks", "checklists", "attachments", "tracking", "service_reports", "time_tracking", "sprints", "story_points"],
    statuses: [
      { id: "s1", workflowId: "w1", name: "Open", key: "NEW", color: "#3B82F6", icon: null, position: 0, isFinal: false, isCanceled: false, transitions: ["ASSIGNED"], createdAt: "" },
      { id: "s2", workflowId: "w1", name: "Assigned", key: "ASSIGNED", color: "#8B5CF6", icon: null, position: 1, isFinal: false, isCanceled: false, transitions: ["ACCEPTED", "NEW"], createdAt: "" },
      { id: "s3", workflowId: "w1", name: "Accepted", key: "ACCEPTED", color: "#06B6D4", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS", "ASSIGNED"], createdAt: "" },
      { id: "s4", workflowId: "w1", name: "In Progress", key: "IN_PROGRESS", color: "#F59E0B", icon: null, position: 3, isFinal: false, isCanceled: false, transitions: ["BLOCKED", "COMPLETED"], wipLimit: 5, createdAt: "" },
      { id: "s5", workflowId: "w1", name: "Blocked", key: "BLOCKED", color: "#EF4444", icon: null, position: 4, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], wipLimit: 3, createdAt: "" },
      { id: "s6", workflowId: "w1", name: "Completed", key: "COMPLETED", color: "#22C55E", icon: null, position: 5, isFinal: true, isCanceled: false, transitions: [], createdAt: "" },
      { id: "s7", workflowId: "w1", name: "Canceled", key: "CANCELED", color: "#94A3B8", icon: null, position: 6, isFinal: false, isCanceled: true, transitions: [], createdAt: "" },
    ],
  },
  "loc-warehouse": {
    name: "Logistics",
    defaultModules: ["subtasks", "checklists", "attachments", "time_tracking"],
    statuses: [
      { id: "s10", workflowId: "w2", name: "Pending", key: "NEW", color: "#3B82F6", icon: null, position: 0, isFinal: false, isCanceled: false, transitions: ["ASSIGNED"], createdAt: "" },
      { id: "s11", workflowId: "w2", name: "Assigned", key: "ASSIGNED", color: "#8B5CF6", icon: null, position: 1, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s12", workflowId: "w2", name: "In Progress", key: "IN_PROGRESS", color: "#F59E0B", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["BLOCKED", "COMPLETED"], createdAt: "" },
      { id: "s13", workflowId: "w2", name: "Blocked", key: "BLOCKED", color: "#EF4444", icon: null, position: 3, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s14", workflowId: "w2", name: "Done", key: "COMPLETED", color: "#22C55E", icon: null, position: 4, isFinal: true, isCanceled: false, transitions: [], createdAt: "" },
      { id: "s15", workflowId: "w2", name: "Canceled", key: "CANCELED", color: "#94A3B8", icon: null, position: 5, isFinal: false, isCanceled: true, transitions: [], createdAt: "" },
    ],
  },
  "loc-service": {
    name: "Field Service",
    defaultModules: ["subtasks", "checklists", "attachments", "tracking", "service_reports", "dependencies", "custom_fields", "time_tracking", "sprints", "story_points", "epics"],
    statuses: [
      { id: "s20", workflowId: "w3", name: "New", key: "NEW", color: "#3B82F6", icon: null, position: 0, isFinal: false, isCanceled: false, transitions: ["ASSIGNED"], createdAt: "" },
      { id: "s21", workflowId: "w3", name: "Assigned", key: "ASSIGNED", color: "#8B5CF6", icon: null, position: 1, isFinal: false, isCanceled: false, transitions: ["ACCEPTED"], createdAt: "" },
      { id: "s22", workflowId: "w3", name: "Accepted", key: "ACCEPTED", color: "#06B6D4", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["EN_ROUTE"], createdAt: "" },
      { id: "s23", workflowId: "w3", name: "En Route", key: "EN_ROUTE", color: "#2563EB", icon: null, position: 3, isFinal: false, isCanceled: false, transitions: ["ARRIVED"], wipLimit: 3, createdAt: "" },
      { id: "s24", workflowId: "w3", name: "On Site", key: "ARRIVED", color: "#10B981", icon: null, position: 4, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s25", workflowId: "w3", name: "Working", key: "IN_PROGRESS", color: "#F59E0B", icon: null, position: 5, isFinal: false, isCanceled: false, transitions: ["BLOCKED", "COMPLETED"], wipLimit: 4, createdAt: "" },
      { id: "s26", workflowId: "w3", name: "Blocked", key: "BLOCKED", color: "#EF4444", icon: null, position: 6, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], wipLimit: 2, createdAt: "" },
      { id: "s27", workflowId: "w3", name: "Completed", key: "COMPLETED", color: "#22C55E", icon: null, position: 7, isFinal: true, isCanceled: false, transitions: [], createdAt: "" },
      { id: "s28", workflowId: "w3", name: "Canceled", key: "CANCELED", color: "#94A3B8", icon: null, position: 8, isFinal: false, isCanceled: true, transitions: [], createdAt: "" },
    ],
  },
  "loc-remote": {
    name: "Software",
    defaultModules: ["subtasks", "dependencies", "checklists", "attachments", "custom_fields", "sprints", "story_points", "epics", "phases"],
    statuses: [
      { id: "s30", workflowId: "w4", name: "Backlog", key: "NEW", color: "#94A3B8", icon: null, position: 0, isFinal: false, isCanceled: false, transitions: ["ASSIGNED"], createdAt: "" },
      { id: "s31", workflowId: "w4", name: "To Do", key: "ASSIGNED", color: "#3B82F6", icon: null, position: 1, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s32", workflowId: "w4", name: "In Progress", key: "IN_PROGRESS", color: "#F59E0B", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["BLOCKED", "COMPLETED"], wipLimit: 6, createdAt: "" },
      { id: "s33", workflowId: "w4", name: "Blocked", key: "BLOCKED", color: "#EF4444", icon: null, position: 3, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], wipLimit: 2, createdAt: "" },
      { id: "s34", workflowId: "w4", name: "Done", key: "COMPLETED", color: "#22C55E", icon: null, position: 4, isFinal: true, isCanceled: false, transitions: [], createdAt: "" },
      { id: "s35", workflowId: "w4", name: "Canceled", key: "CANCELED", color: "#94A3B8", icon: null, position: 5, isFinal: false, isCanceled: true, transitions: [], createdAt: "" },
    ],
  },
  "loc-factory": {
    name: "Simple",
    defaultModules: ["checklists", "attachments", "time_tracking"],
    statuses: [
      { id: "s40", workflowId: "w5", name: "Open", key: "NEW", color: "#3B82F6", icon: null, position: 0, isFinal: false, isCanceled: false, transitions: ["ASSIGNED"], createdAt: "" },
      { id: "s41", workflowId: "w5", name: "Assigned", key: "ASSIGNED", color: "#8B5CF6", icon: null, position: 1, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s42", workflowId: "w5", name: "Working", key: "IN_PROGRESS", color: "#F59E0B", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["COMPLETED"], createdAt: "" },
      { id: "s43", workflowId: "w5", name: "Arrived", key: "ARRIVED", color: "#10B981", icon: null, position: 2, isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"], createdAt: "" },
      { id: "s44", workflowId: "w5", name: "Done", key: "COMPLETED", color: "#22C55E", icon: null, position: 3, isFinal: true, isCanceled: false, transitions: [], createdAt: "" },
      { id: "s45", workflowId: "w5", name: "Canceled", key: "CANCELED", color: "#94A3B8", icon: null, position: 4, isFinal: false, isCanceled: true, transitions: [], createdAt: "" },
    ],
  },
}

// ─── Module resolution ──────────────────────────────────────────────────────
// Resolution chain: space.enabledModules → workflow.defaultModules → org.enabledModules
// Space modules override workflow defaults when explicitly set.

/**
 * Hook to get the effective enabled modules for a given space.
 * Resolution: space overrides → workflow defaults → org fallback.
 */
export function useSpaceModules(spaceId: string | null, useMock = false) {
  const { user, hasModule: orgHasModule } = useAuth()

  const { data: spaceModules } = useQuery({
    queryKey: ["space-modules", spaceId],
    queryFn: () => locationsApi.getEffectiveModules(spaceId!),
    enabled: !!spaceId && !useMock,
    staleTime: 60000,
  })

  // In mock mode: resolve space modules from mock data, falling back to workflow defaults
  const resolvedModules = useMemo(() => {
    if (!useMock || !spaceId) return null

    // 1. Check space-level overrides
    const space = MOCK_SPACES.find(s => s.id === spaceId) as any
    const spaceModules = space?.enabledModules as string[] | undefined

    // 2. Check workflow defaults
    const workflow = MOCK_SPACE_WORKFLOWS[spaceId]
    const workflowDefaults = workflow?.defaultModules

    // Space modules take priority if set, otherwise workflow defaults
    if (spaceModules && spaceModules.length > 0) return spaceModules
    if (workflowDefaults) return workflowDefaults
    return null
  }, [useMock, spaceId])

  const hasModule = useCallback(
    (module: string) => {
      if (!spaceId) return orgHasModule(module)
      if (useMock && resolvedModules) return resolvedModules.includes(module)
      if (spaceModules?.enabledModules) return spaceModules.enabledModules.includes(module)
      return orgHasModule(module)
    },
    [spaceId, useMock, resolvedModules, spaceModules, orgHasModule],
  )

  const enabledModules = useMemo(() => {
    if (spaceId && useMock && resolvedModules) return resolvedModules
    if (spaceId && !useMock && spaceModules) return spaceModules.enabledModules
    return user?.enabledModules ?? []
  }, [spaceId, useMock, resolvedModules, spaceModules, user?.enabledModules])

  return { hasModule, enabledModules }
}

/**
 * Hook to get the workflow for a given space.
 * In mock mode, returns space-specific mock workflow.
 */
export function useSpaceWorkflow(spaceId: string | null, useMock = false) {
  const mockWorkflow = useMemo(() => {
    if (!useMock || !spaceId) return null
    return MOCK_SPACE_WORKFLOWS[spaceId] || null
  }, [useMock, spaceId])

  const statuses = mockWorkflow?.statuses ?? []
  const workflowName = mockWorkflow?.name ?? null

  return {
    statuses,
    workflowName,
    hasWorkflow: statuses.length > 0,
  }
}
