import { cn } from "@/lib/utils"
import { TableHead } from "@/components/ui/table"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"

/** TrackingTab's module-level helpers, moved here unchanged so its sections can read them too. */
// Sortable column header — click to cycle asc → desc → off.
export function SortHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className="font-semibold text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  )
}
