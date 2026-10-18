import type { QueryClient } from "@tanstack/react-query"
import { effectiveSpaceModules } from "@hbcfield/shared/client"
import { locationsApi, type CompanyLocation } from "@/lib/api"
import { fetchAllPages } from "@/lib/paginate"
import { keys } from "@/lib/query-keys"

/**
 * The workspace directory — every workspace the reader may see, archived ones
 * included — as ONE cached list the whole app shares.
 *
 * Several surfaces each asked `GET /locations` with their own parameters on the
 * same page load: the shell (does this org have a workspace at all?), the task
 * page (the workspace tabs), the dashboard (the grid). And every task row asked
 * `GET /locations/:id/modules` for its own workspace — nine requests for nine
 * workspaces, the same route nine times in one second, which is what tripped the
 * gateway's per-route limit. The list already carries each workspace's own
 * `enabledModules` and `workflowId`, so the modules answer is derived from it.
 *
 * Callers wanting only the active ones filter `isActive` themselves — the
 * server's default list is exactly that subset.
 */
const SPACE_DIRECTORY_PAGE = 200

export const spaceDirectoryKey = () => keys.locations.list({ directory: true })

export function fetchSpaceDirectory(): Promise<CompanyLocation[]> {
  return fetchAllPages((page) =>
    locationsApi.list({ page, limit: SPACE_DIRECTORY_PAGE, includeInactive: true }),
  )
}

export const SPACE_DIRECTORY_STALE_MS = 60_000

interface EffectiveSpaceModules {
  enabledModules: string[]
  workflowId?: string | null
}

/**
 * A workspace's effective modules from the directory — the same rule the server's
 * `GET /locations/:id/modules` applies (`effectiveSpaceModules`: the workspace's
 * own list, else the organization's). `null` when the directory does not hold it.
 */
export function spaceModulesFromDirectory(
  directory: readonly CompanyLocation[] | undefined,
  spaceId: string,
  orgModules: readonly string[] | undefined,
): EffectiveSpaceModules | null {
  const space = directory?.find((s) => s.id === spaceId) as
    | (CompanyLocation & { enabledModules?: unknown; workflowId?: string | null })
    | undefined
  // A list row without the field is not an answer (an older/narrower shape).
  if (!space || !("enabledModules" in space)) return null
  return {
    enabledModules: effectiveSpaceModules(space.enabledModules, orgModules ?? []),
    workflowId: space.workflowId ?? null,
  }
}

/**
 * The `queryFn` behind `keys.spaces.modules(spaceId)`.
 *
 * First load: from the directory (shared, deduplicated with any request already
 * in flight). A REFETCH — there is data already, so somebody asked for it fresh —
 * and a workspace the directory does not hold (outside the reader's list) go to
 * the workspace's own endpoint, as before.
 */
export async function loadSpaceModules(
  qc: QueryClient,
  spaceId: string,
  orgModules: readonly string[] | undefined,
): Promise<EffectiveSpaceModules | undefined> {
  const isRefetch = qc.getQueryData(keys.spaces.modules(spaceId)) !== undefined
  if (!isRefetch) {
    try {
      const directory = await qc.fetchQuery({
        queryKey: spaceDirectoryKey(),
        queryFn: fetchSpaceDirectory,
        staleTime: SPACE_DIRECTORY_STALE_MS,
      })
      const derived = spaceModulesFromDirectory(directory, spaceId, orgModules)
      if (derived) return derived
    } catch {
      // The directory could not be read — ask the workspace itself.
    }
  }
  return locationsApi.getEffectiveModules(spaceId)
}
