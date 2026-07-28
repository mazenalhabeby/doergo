/**
 * Setup build orchestrator — turns a confirmed plan into real org configuration
 * by reusing the existing API client (no new endpoints). Side-effects only.
 *
 * Performance: the first Space is created alone (it must win the "is default"
 * race), then the remaining Spaces are created concurrently.
 */
import { organizationsApi, locationsApi } from "@/lib/api"

export interface BuildInput {
  /** Canonical English industry label to store on the org. */
  industryLabel: string
  /** Feature-module keys to enable org-wide + on each space. */
  moduleKeys: string[]
  /** Resolved (localized) space names to create, in order. */
  spaceNames: string[]
}

export interface BuildResult {
  spacesCreated: number
  profileUpdated: boolean
}

export type BuildStep = "company" | "spaces" | "tools" | "finish"

/**
 * Build the organization from a plan. Resilient: Spaces are the critical output
 * (the app requires ≥1), so they're guaranteed before the non-critical profile
 * update; a failed profile update does not abort the build.
 */
export async function buildOrg(
  input: BuildInput,
  onStep?: (step: BuildStep) => void,
): Promise<BuildResult> {
  const names = input.spaceNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) throw new Error("No spaces to create")

  const modules = input.moduleKeys

  // 1. First space alone — it becomes the org's default bucket.
  onStep?.("company")
  await locationsApi.create({ name: names[0]!, enabledModules: modules })
  let spacesCreated = 1

  // 2. Remaining spaces concurrently.
  onStep?.("spaces")
  if (names.length > 1) {
    const rest = await Promise.allSettled(
      names.slice(1).map((name) => locationsApi.create({ name, enabledModules: modules })),
    )
    spacesCreated += rest.filter((r) => r.status === "fulfilled").length
  }

  // 3. Org profile: industry + enabled feature modules (non-critical).
  onStep?.("tools")
  let profileUpdated = false
  try {
    await organizationsApi.updateProfile({ industry: input.industryLabel, enabledModules: modules })
    profileUpdated = true
  } catch {
    // Non-fatal — the org is usable with its spaces; industry/modules can be set later.
  }

  onStep?.("finish")
  return { spacesCreated, profileUpdated }
}
