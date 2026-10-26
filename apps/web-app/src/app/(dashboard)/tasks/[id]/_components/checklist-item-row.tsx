"use client"

import React from "react"
import { Check, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { type ChecklistItem, type CrewView } from "@/lib/api"
import { cn } from "@/lib/utils"
import { personName, tickedByOther } from "@hbcfield/shared/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// ── Single checklist item ───────────────────────────────────────────────────

interface ChecklistItemRowProps {
  item: ChecklistItem
  taskId: string
  onToggle: (itemId: string, isCompleted: boolean) => void
  onDelete: (itemId: string) => void
  isDeleting: boolean
  /** The crew, when the job has one: owners are picked from it (shared tasks/checklist.ts). */
  crew: CrewView | null
  /** The leader or the office: may give the item to anybody on the crew. The server judges it again. */
  mayHandOut: boolean
  /** The viewer — a member on the crew takes a free item or gives their own back. */
  meId: string | null
  onOwner: (itemId: string, assigneeId: string | null) => void
}

export const ChecklistItemRow = React.memo(function ChecklistItemRow({
  item,
  taskId,
  onToggle,
  onDelete,
  isDeleting,
  crew,
  mayHandOut,
  meId,
  onOwner,
}: ChecklistItemRowProps) {
  const { t } = useTranslation()
  const at = item.completedAt
    ? new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : ""
  const doneLine =
    item.isCompleted && item.completedBy
      ? tickedByOther(item)
        ? t("tasks.checklist.doneFor", {
            owner: item.assignee?.firstName ?? "",
            name: personName(item.completedBy),
            time: at,
          })
        : t("tasks.checklist.doneBy", { name: personName(item.completedBy), time: at })
      : null
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "hover:bg-accent/50 transition-colors duration-150",
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggle(item.id, !item.isCompleted)}
        className={cn(
          "flex-shrink-0 size-[18px] rounded-[5px] border-2 flex items-center justify-center",
          "transition-all duration-200",
          item.isCompleted ? "bg-primary border-primary" : "border-border hover:border-ring",
        )}
        style={{ transitionTimingFunction: APPLE_EASE }}
      >
        {item.isCompleted && <Check className="size-3 text-white" strokeWidth={3} />}
      </button>

      {/* Text, and who ticked it */}
      <span className="flex-1 min-w-0 flex flex-col">
        <span
          className={cn(
            "text-sm transition-all duration-200",
            item.isCompleted ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {item.text}
        </span>
        {doneLine && <span className="text-xs text-muted-foreground">{doneLine}</span>}
      </span>

      {/* Owner — only on a job with a crew */}
      {crew &&
        crew.members.length > 1 &&
        (mayHandOut ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex-shrink-0 text-xs rounded-full px-2.5 py-1 border transition-colors",
                  item.assignee
                    ? "border-border text-foreground hover:bg-accent"
                    : "border-dashed border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {item.assignee ? personName(item.assignee) : t("tasks.checklist.giveTo")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {crew.members.map((m) => (
                <DropdownMenuItem key={m.user.id} onSelect={() => onOwner(item.id, m.user.id)}>
                  {item.assigneeId === m.user.id ? "✓ " : ""}
                  {personName(m.user)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOwner(item.id, null)}>{t("tasks.checklist.nobody")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : meId && item.assigneeId === meId && !item.isCompleted ? (
          // My own item: give it back (shared mayChangeChecklistOwner — a member may).
          <button
            type="button"
            onClick={() => onOwner(item.id, null)}
            className={
              "flex-shrink-0 text-xs rounded-full px-2.5 py-1 border border-border " + "text-foreground hover:bg-accent"
            }
            title={t("tasks.checklist.giveBack")}
          >
            {t("tasks.checklist.you")} ×
          </button>
        ) : !item.assigneeId && !item.isCompleted && meId && crew.members.some((m) => m.user.id === meId) ? (
          <button
            type="button"
            onClick={() => onOwner(item.id, meId)}
            className={
              "flex-shrink-0 text-xs rounded-full px-2.5 py-1 bg-primary " + "text-primary-foreground hover:opacity-90"
            }
          >
            {t("tasks.checklist.takeIt")}
          </button>
        ) : item.assignee ? (
          <span className="flex-shrink-0 text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
            {personName(item.assignee)}
          </span>
        ) : null)}

      {/* Delete — somebody else's item only for them, the leader or the office (shared mayEditChecklistItem) */}
      {(!item.assigneeId || item.assigneeId === meId || mayHandOut) && (
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          disabled={isDeleting}
          className={
            "flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 " +
            "text-muted-foreground hover:text-red-500 hover:bg-red-50 " +
            "dark:hover:bg-red-500/10 transition-all duration-150"
          }
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
})

// ── Checklist Section ───────────────────────────────────────────────────────

export interface ChecklistSectionProps {
  taskId: string
  items: ChecklistItem[]
  /** The job is paused — passed on to the shared job-time read the crew comes from. */
  paused?: boolean
  /** The job's workspace — "assign tasks" counts org-wide or HERE, as the server decides it. */
  spaceId?: string | null
}
