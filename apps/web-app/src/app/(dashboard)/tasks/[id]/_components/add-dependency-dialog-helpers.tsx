"use client"

/** AddDependencyDialog's module-level helpers, moved here unchanged so its sections can read them too. */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEP_TYPE_LABELS: Record<string, string> = {
  FINISH_TO_START: "FS",
  START_TO_START: "SS",
  FINISH_TO_FINISH: "FF",
  START_TO_FINISH: "SF",
}

export const DEP_TYPE_KEYS: Record<string, string> = {
  FINISH_TO_START: "tasks.dependencies.types.FINISH_TO_START",
  START_TO_START: "tasks.dependencies.types.START_TO_START",
  FINISH_TO_FINISH: "tasks.dependencies.types.FINISH_TO_FINISH",
  START_TO_FINISH: "tasks.dependencies.types.START_TO_FINISH",
}
