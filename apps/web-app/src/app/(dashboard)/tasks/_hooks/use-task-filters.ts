"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { GroupByOption } from "../_components/grouped-list"
import type { BacklogSortField, BacklogSortDir } from "../_components/backlog-toolbar"
import { VIEW_MODE_STORAGE_KEY, readStoredViewMode } from "../_components/tasks-skeleton"
import { GROUP_BY_STORAGE_KEY, type TaskScope, type ViewMode } from "../_lib/task-list"

/**
 * What slice of the work the page is looking at: search, status tab, view,
 * grouping, page, sprint scope, epic, workspace, task type and "mine". The
 * workspace lives in the URL (`?space=`), the view and grouping in storage.
 */
export function useTaskFilters() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  // The input stays instant; only the settled value drives the query.
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "all"
  )
  // Same reader the route-level skeleton uses, so the placeholder and the page
  // always open on the same view.
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode)

  const [groupBy, setGroupBy] = useState<GroupByOption>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(GROUP_BY_STORAGE_KEY)
      if (stored && ["none", "sprint", "epic", "assignee", "priority", "space"].includes(stored)) {
        return stored as GroupByOption
      }
    }
    return "none"
  })
  const [page, setPage] = useState(1)
  const limit = 20

  // Sprint scope state
  const [scope, setScope] = useState<TaskScope>("all")
  // Epic filter state
  const [epicFilter, setEpicFilter] = useState<string>("all")
  // Space filter state
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    searchParams.get("space") || null
  )

  // Backlog sort state
  const [backlogSortField, setBacklogSortField] = useState<BacklogSortField>("priority")
  const [backlogSortDir, setBacklogSortDir] = useState<BacklogSortDir>("asc")

  // Persist view mode
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    // Clear epic filter when leaving schedule view (roadmap lives there)
    if (mode !== "schedule") setEpicFilter("all")
  }, [])

  // Persist group-by
  const handleGroupByChange = useCallback((value: GroupByOption) => {
    setGroupBy(value)
    localStorage.setItem(GROUP_BY_STORAGE_KEY, value)
  }, [])

  // The Task Type picker — null means "the space's (or org's) default".
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)

  // Mine, or everything I oversee (see useTaskListData for who is offered it).
  const [mineOnly, setMineOnly] = useState(false)

  // Space change handler
  const handleSpaceChange = useCallback((spaceId: string | null) => {
    setSelectedSpaceId(spaceId)
    setPage(1)
    setActiveTab("all") // Reset tab since workflow changes per space
    setSelectedWorkflowId(null) // Reset task-type picker to the new space's default
    setEpicFilter("all") // Reset epic filter — different space has different epics
    // Update URL
    const url = spaceId ? `/tasks?space=${spaceId}` : "/tasks"
    router.replace(url, { scroll: false })
  }, [router])

  // Any filter change invalidates the page number: page 3 of an unfiltered list
  // is not page 3 of a filtered one, and asking for it returns an empty screen.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedSpaceId, scope, epicFilter, activeTab])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setPage(1)
  }

  return {
    searchQuery, setSearchQuery, debouncedSearch,
    activeTab, setActiveTab, handleTabChange,
    viewMode, handleViewModeChange,
    groupBy, setGroupBy, handleGroupByChange,
    page, setPage, limit,
    scope, setScope,
    epicFilter, setEpicFilter,
    selectedSpaceId, handleSpaceChange,
    backlogSortField, setBacklogSortField,
    backlogSortDir, setBacklogSortDir,
    selectedWorkflowId, setSelectedWorkflowId,
    mineOnly, setMineOnly,
  }
}

export type TaskFilters = ReturnType<typeof useTaskFilters>
