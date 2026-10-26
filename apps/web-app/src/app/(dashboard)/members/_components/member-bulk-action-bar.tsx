"use client"

import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { MapPin, ShieldCheck, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/common/confirm-dialog"

// ---------------------------------------------------------------------------
// Bulk Action Bar for members
// ---------------------------------------------------------------------------

interface MemberBulkActionBarProps {
  selectedIds: Set<string>
  locations: { id: string; name: string }[]
  onClear: () => void
  onBulkRoleChange: (memberIds: string[], role: string) => void
  onBulkSpaceAssign: (memberIds: string[], locationId: string) => void
  onBulkAccess: (memberIds: string[]) => void
  onBulkRemove: (memberIds: string[]) => void
}

export const MemberBulkActionBar = memo(function MemberBulkActionBar({
  selectedIds,
  locations,
  onClear,
  onBulkRoleChange,
  onBulkSpaceAssign,
  onBulkAccess,
  onBulkRemove,
}: MemberBulkActionBarProps) {
  const { t } = useTranslation()
  const count = selectedIds.size
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ids = Array.from(selectedIds)

  if (count === 0) return null

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 rounded-full py-2 pl-5 pr-2",
        "border border-border bg-card shadow-shell-pop",
        "animate-in slide-in-from-bottom-4 fade-in-0 duration-200",
      )}
      style={{ animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
    >
      <span className="text-sm font-semibold text-foreground whitespace-nowrap pr-1">
        {t("members.bulk.selected", { count })}
      </span>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs font-medium">
            {t("members.bulk.role")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-[160px]">
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "ADMIN")}>{t("members.roles.admin")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "EMPLOYEE")}>
            {t("members.roles.employee")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Space */}
      {locations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs font-medium">
              {t("members.bulk.space")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[180px]">
            {locations.map((loc) => (
              <DropdownMenuItem key={loc.id} onClick={() => onBulkSpaceAssign(ids, loc.id)}>
                <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                {loc.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Access — full Access Builder applied to all selected members */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-3 text-xs font-medium"
        onClick={() => onBulkAccess(ids)}
      >
        <ShieldCheck className="size-3.5 mr-1 text-muted-foreground" />
        {t("members.bulk.access", "Access")}
      </Button>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className={
          "h-8 rounded-full px-3 text-xs font-medium text-shell-crit hover:text-shell-crit " +
          "hover:bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]"
        }
        onClick={() => setConfirmRemove(true)}
      >
        <Trash2 className="size-3.5 mr-1" />
        {t("members.actions.remove")}
      </Button>

      {/* Clear */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <X className="size-3.5" />
      </Button>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("members.bulk.removeConfirm", { count })}
        description={t("common.cannotBeUndone")}
        confirmLabel={t("members.actions.remove")}
        onConfirm={() => onBulkRemove(ids)}
        destructive
      />
    </div>
  )
})
