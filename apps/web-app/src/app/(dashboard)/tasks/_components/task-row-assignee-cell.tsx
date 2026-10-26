"use client"

import { useTranslation } from "react-i18next"
import { UserPlus } from "lucide-react"
import { personName, isOpenToRole } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import { OpenRoleChip } from "./open-role-chip"
import { TaskAssigneesStack, TaskPersonAvatar } from "./task-avatars"

/** A table row's assignee cell: who is on the task (or the role it is open to); a click opens the assign dialog. */
export function TaskRowAssigneeCell({ task, onAssign }: { task: Task; onAssign: (taskId: string) => void }) {
  const { t } = useTranslation()
  return (
    <div
      data-no-navigate
      className={
        "-mx-1.5 flex min-w-0 cursor-pointer items-center justify-end gap-2 rounded-full px-1.5 py-1 " +
        "transition-colors hover:bg-shell-chip"
      }
      onClick={(e) => {
        e.stopPropagation()
        onAssign(task.id)
      }}
      /* A truncated name is unreadable on its own, so the tooltip carries who
         is on the task as well as what clicking does. */
      title={[
        task.assignees?.length
          ? task.assignees.map((a) => personName(a.user)).join(", ")
          : task.assignedTo
            ? personName(task.assignedTo)
            : "",
        t("tasks.row.manageAssignees"),
      ]
        .filter(Boolean)
        .join(" — ")}
    >
      {task.assignees && task.assignees.length > 0 ? (
        /*
          min-w-0 on the INNER row too, not just the cell.

          A flex item's default min-width is auto, so this div refused to
          shrink below its content and the `truncate` on the name never
          engaged — a long name simply overflowed the 160px cell and ran
          across the due date beside it. The outer cell had min-w-0; the row
          inside it did not, and that is the one the text lives in.
        */
        <div className="flex items-center min-w-0">
          <span className="flex-shrink-0">
            <TaskAssigneesStack assignees={task.assignees} />
          </span>
          {task.assignees.length <= 2 && (
            <span className="ml-2 truncate text-[13px] text-muted-foreground">
              {personName(task.assignees[0]!.user)}
            </span>
          )}
        </div>
      ) : task.assignedTo ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <TaskPersonAvatar person={task.assignedTo} />
          <span className="truncate text-[13px] text-muted-foreground">{personName(task.assignedTo)}</span>
        </div>
      ) : isOpenToRole(task) ? (
        <OpenRoleChip task={task} />
      ) : (
        <span
          className={
            "inline-flex h-[30px] items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold " +
            "text-primary-foreground"
          }
        >
          <UserPlus className="size-3.5" />
          {t("tasks.card.assign")}
        </span>
      )}
    </div>
  )
}
