"use client"

import { useQuery } from "@tanstack/react-query"
import {
  fetchSpaceDirectory,
  spaceDirectoryKey,
  SPACE_DIRECTORY_STALE_MS,
} from "@/lib/space-directory"

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
