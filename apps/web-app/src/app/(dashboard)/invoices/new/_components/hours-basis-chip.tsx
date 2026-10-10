"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, ChevronDown } from "lucide-react"
import { formatHoursMinutes } from "@hbcfield/shared/client"

import { keys } from "@/lib/query-keys"
import { spaceMembersApi } from "@/lib/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

const BASIS_TONE: Record<string, string> = {
  SHIFT: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  CLOCKED: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  COUNTED: "bg-green-500/15 text-green-700 dark:text-green-300",
}

/**
 * Which hours a person's line bills — and, where the person belongs to the
 * workspace, the switch: each choice with the hours it would bill. Choosing
 * saves it on the person in this workspace (the same setting as their panel),
 * and the line follows. Working view only, never the client's copy.
 */
export function HoursBasisChip({
  basis, hoursByBasis, spaceId, assignmentId,
}: {
  basis?: string | null
  hoursByBasis?: Record<string, number>
  spaceId?: string | null
  assignmentId?: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (b: "COUNTED" | "CLOCKED" | "SHIFT") => spaceMembersApi.updateRoles(spaceId!, assignmentId!, { hoursBasis: b }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.invoices.gather() })
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      notify.success(t("invoices.create.basisSaved"))
    },
    onError: (e: Error) => notify.error(e.message),
  })
  if (!basis) return null
  const chip = (
    <span className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", BASIS_TONE[basis] ?? BASIS_TONE.COUNTED)}>
      {save.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
      {t(`scheduling.membersPage.basis.${basis}`)}
      {spaceId && assignmentId && hoursByBasis && <ChevronDown className="size-3" />}
    </span>
  )
  if (!spaceId || !assignmentId || !hoursByBasis) return chip
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("scheduling.membersPage.hoursBasis")}>
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">{t("scheduling.membersPage.hoursBasis")}</DropdownMenuLabel>
        {(["COUNTED", "CLOCKED", "SHIFT"] as const).map((b) => (
          <DropdownMenuItem key={b} onSelect={() => b !== basis && save.mutate(b)} className="flex items-center justify-between gap-3">
            <span className={cn(b === basis && "font-semibold")}>{t(`scheduling.membersPage.basis.${b}`)}</span>
            <span className="tabular-nums text-muted-foreground">{formatHoursMinutes(hoursByBasis[b] ?? 0)}</span>
          </DropdownMenuItem>
        ))}
        <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">{t("invoices.create.basisSavedHint")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
