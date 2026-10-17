"use client"

import { Smartphone, Monitor, Layers } from "lucide-react"
import type { MobileModule, SpaceScope, AccessPlatform } from "@hbcfield/shared/client"

/** AccessFields's module-level helpers, moved here unchanged so its sections can read them too. */
// Feature tabs only — `create_task` and `manage` are NOT stored here; they
// derive from the Create / Manage permissions below (single source of truth).
export const FEATURE_TABS: { key: MobileModule; labelKey: string }[] = [
  { key: "tasks", labelKey: "accessBuilder.featureTabs.tasks" },
  { key: "clock", labelKey: "accessBuilder.featureTabs.clock" },
  { key: "time_off", labelKey: "accessBuilder.featureTabs.timeOff" },
]

export const PLATFORMS: { key: AccessPlatform; labelKey: string; icon: typeof Monitor }[] = [
  { key: "web", labelKey: "accessBuilder.platforms.webOnly", icon: Monitor },
  { key: "mobile", labelKey: "accessBuilder.platforms.mobileOnly", icon: Smartphone },
  { key: "both", labelKey: "accessBuilder.platforms.both", icon: Layers },
]

export const SCOPES: { key: SpaceScope; labelKey: string; descKey: string }[] = [
  { key: "own", labelKey: "accessBuilder.scopes.own.label", descKey: "accessBuilder.scopes.own.desc" },
  { key: "tasks", labelKey: "accessBuilder.scopes.tasks.label", descKey: "accessBuilder.scopes.tasks.desc" },
  { key: "all", labelKey: "accessBuilder.scopes.all.label", descKey: "accessBuilder.scopes.all.desc" },
]

export const TASK_SCOPES = [
  { key: "SELF", labelKey: "accessBuilder.taskScopes.self" },
  { key: "SPACE", labelKey: "accessBuilder.taskScopes.space" },
  { key: "ORG", labelKey: "accessBuilder.taskScopes.org" },
]
