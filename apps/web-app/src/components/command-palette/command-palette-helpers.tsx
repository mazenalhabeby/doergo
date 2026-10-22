"use client"

/** CommandPalette's module-level helpers, moved here unchanged so its sections can read them too. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={"pointer-events-none inline-flex h-5 select-none items-center gap-1 " +
        "rounded border border-border bg-muted px-1.5 font-mono text-[10px] " +
        "font-medium text-muted-foreground"}>
      {children}
    </kbd>
  )
}

// ---------------------------------------------------------------------------
// Group label keys
// ---------------------------------------------------------------------------

export const GROUP_LABEL_KEYS: Record<string, string> = {
  navigation: "commandPalette.groups.navigation",
  tasks: "commandPalette.groups.tasks",
  sprints: "commandPalette.groups.sprints",
  spaces: "commandPalette.groups.spaces",
  "quick-actions": "commandPalette.groups.quickActions",
}
