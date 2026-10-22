"use client"

import { useEffect } from "react"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/** The workspaces offered, and the default one picked once they load. */
export function useTaskSpaces({
  open,
  spaceId,
  setSpaceId,
  defaultSpaceId,
}: {
  open: boolean
  spaceId: string
  setSpaceId: (id: string) => void
  defaultSpaceId?: string | null
}) {
  const { data: availableSpaces = [] } = useActiveSpaces({ enabled: open })
  const hasSpaces = availableSpaces.length > 0

  // Every task belongs to a space — once spaces load, default the picker to the
  // org's "General" (default) space instead of leaving it unselected.
  useEffect(() => {
    if (open && spaceId === "none" && !defaultSpaceId && availableSpaces.length) {
      const def =
        availableSpaces.find((s) => s.isDefault) ??
        availableSpaces.find((s) => s.name === "General") ??
        availableSpaces[0]
      if (def?.id) setSpaceId(def.id)
    }
  }, [open, availableSpaces, defaultSpaceId, spaceId])

  return { availableSpaces, hasSpaces }
}
