"use client"

import { useTranslation } from "react-i18next"
import { UsersRound } from "lucide-react"
import { isOpenToRole } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"

/** "Open · Mechanic" — in a row or on a card, where nobody has taken a role task yet. */
export function OpenRoleChip({ task }: { task: Pick<Task, "openRoleId" | "openRole" | "openSpotsLeft" | "status"> }) {
  const { t } = useTranslation()
  if (!isOpenToRole(task)) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
      <UsersRound className="size-3 shrink-0" />
      <span className="truncate">{t("tasks.role.chip", { role: task.openRole?.name ?? "" })}</span>
    </span>
  )
}
