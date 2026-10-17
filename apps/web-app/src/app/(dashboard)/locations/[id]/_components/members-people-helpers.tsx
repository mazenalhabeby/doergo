"use client"

/** What the people section's parts share: the no-role choice and a role's tag (moved here unchanged). */
export const NONE = "__none__"

/** One role's coloured dot + name, read-only. */
export function RoleTag({ role }: { role?: { name: string; color?: string | null } | null }) {
  if (!role) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color ?? "hsl(var(--muted-foreground))" }} />
      {role.name}
    </span>
  )
}
