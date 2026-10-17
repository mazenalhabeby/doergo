"use client"

import { useQuery } from "@tanstack/react-query"
import type { CompanyLocation } from "@/lib/api"
import { fetchSpaceDirectory, spaceDirectoryKey, SPACE_DIRECTORY_STALE_MS } from "@/lib/space-directory"

/**
 * The shared workspace directory (archived included) — see lib/space-directory.
 * One request per session minute, whichever surface asks first.
 */
export function useSpaceDirectory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: spaceDirectoryKey(),
    queryFn: fetchSpaceDirectory,
    staleTime: SPACE_DIRECTORY_STALE_MS,
    enabled,
  })
}

const activeOnly = (all: CompanyLocation[]) => all.filter((s) => s.isActive !== false)

/**
 * The directory's ACTIVE workspaces — what a picker offers. Same request and
 * cache as `useSpaceDirectory`; a bare list call stopped at the
 * server's page size (20) and each caller cached it under its own key.
 */
export function useActiveSpaces({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: spaceDirectoryKey(),
    queryFn: fetchSpaceDirectory,
    staleTime: SPACE_DIRECTORY_STALE_MS,
    enabled,
    select: activeOnly,
  })
}
