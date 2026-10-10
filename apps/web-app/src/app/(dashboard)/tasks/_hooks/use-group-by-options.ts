"use client"

import { useMemo, useEffect } from "react"

import type { GroupByOption } from "../_components/grouped-list"
import { GROUP_BY_OPTIONS } from "../_lib/task-list"

/**
 * Which groupings the list offers here — sprint and epic only where the
 * workspace runs those modules — and falling back to "none" when the current
 * one stops being offered.
 */
export function useGroupByOptions({
  groupBy,
  setGroupBy,
  effectiveHasModule,
  epicCount,
  selectedSpaceId,
  spaceCount,
}: {
  groupBy: GroupByOption
  setGroupBy: (value: GroupByOption) => void
  effectiveHasModule: (key: string) => boolean
  epicCount: number
  selectedSpaceId: string | null
  spaceCount: number
}) {
  // Available group-by options based on modules
  const availableGroupByOptions = useMemo(() => {
    return GROUP_BY_OPTIONS.filter(opt => {
      if (opt.value === "none") return true
      if (opt.value === "sprint") return effectiveHasModule('sprints')
      if (opt.value === "epic") return effectiveHasModule('epics') && epicCount > 0
      if (opt.value === "assignee") return false // removed from list groups
      if (opt.value === "priority") return true
      if (opt.value === "space") return false // spaces handled by tabs above
      return true
    })
  }, [effectiveHasModule, epicCount, selectedSpaceId, spaceCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset group-by when current option is not available for the selected space
  useEffect(() => {
    if (groupBy !== "none" && !availableGroupByOptions.some(o => o.value === groupBy)) {
      setGroupBy("none")
    }
  }, [availableGroupByOptions, groupBy, setGroupBy])

  // Group-by dropdown label
  const groupByLabel = useMemo(() => {
    if (groupBy === "none") return "Group: None"
    const opt = GROUP_BY_OPTIONS.find(o => o.value === groupBy)
    return `Group: ${opt?.label ?? groupBy}`
  }, [groupBy])

  return { availableGroupByOptions, groupByLabel }
}
