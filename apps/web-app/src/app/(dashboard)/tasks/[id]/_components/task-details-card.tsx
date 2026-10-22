"use client"

import { personInitials, personName } from "@hbcfield/shared/client"
import Link from "next/link"
import { Calendar, MapPin, Clock, User, Users, Plus, X, Crown, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { InlineEditField } from "./inline-edit-field"
import { LeaveByLine } from "./leave-by-line"
import { OpenToRoleAction } from "./open-to-role-dialog"
import { formatMediumDate } from "@/lib/format-date"
import { useTranslation } from "react-i18next"
import { SidebarRow } from "./sidebar-row"
import type { TaskDetailSidebarProps } from "./task-detail-sidebar-types"

type TaskDetailsCardProps = Pick<
  TaskDetailSidebarProps,
  "task" | "canEdit" | "canAssign" | "onFieldSave" | "onAssignClick" | "onRemoveAssignee" | "onSetLead"
>

/** The Details card: who is on the job (lead, remove, make lead), the dates, the place, the hours, who created it. */
export function TaskDetailsCard({
  task,
  canEdit,
  canAssign,
  onFieldSave,
  onAssignClick,
  onRemoveAssignee,
  onSetLead,
}: TaskDetailsCardProps) {
  const { t } = useTranslation()
  const assignees = task.assignees || []
  const hasMultiple = assignees.length > 1
  const leadCount = assignees.filter((a) => a.role === "LEAD").length
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {t("tasks.sidebar.details")}
      </h3>

      <div className="divide-y divide-border/50">
        {/* Assignees */}
        <div className="py-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{t("tasks.sidebar.assignees")}</span>
              {assignees.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60 bg-muted px-1 py-0.5 rounded font-medium">
                  {assignees.length}
                </span>
              )}
            </div>
            {canAssign && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={onAssignClick}
              >
                <Plus className="size-3 mr-0.5" /> {t("tasks.sidebar.add")}
              </Button>
            )}
          </div>

          {assignees.length > 0 ? (
            <div className="space-y-1">
              {assignees.map((a) => {
                const isLead = a.role === "LEAD"
                // Assignment permission, not edit permission — and never
                // strip the last lead from a multi-assignee task.
                const canRemove = canAssign && !(isLead && leadCount <= 1 && hasMultiple)
                const canPromote = canAssign && !isLead && hasMultiple

                return (
                  <div
                    key={a.id}
                    className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="size-6 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-semibold text-foreground">{personInitials(a.user)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/members/${a.userId}`}
                        className={
                          "text-xs font-medium text-foreground truncate block hover:text-blue-600 " +
                          "transition-colors"
                        }
                      >
                        {personName(a.user)}
                      </Link>
                    </div>
                    {isLead && (
                      <span
                        className={
                          "text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-500/20 " +
                          "dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold uppercase " +
                          "tracking-wider flex-shrink-0"
                        }
                      >
                        {t("tasks.sidebar.lead")}
                      </span>
                    )}
                    {/* Actions — visible on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canPromote && onSetLead && (
                        <button
                          onClick={() => onSetLead(a.id)}
                          className={
                            "size-5 rounded flex items-center justify-center text-muted-foreground/60 " +
                            "hover:text-foreground hover:bg-muted transition-colors"
                          }
                          title={t("tasks.sidebar.makeLead")}
                        >
                          <Crown className="size-3" />
                        </button>
                      )}
                      {canRemove && onRemoveAssignee && (
                        <button
                          onClick={() => onRemoveAssignee(a.id)}
                          className={
                            "size-5 rounded flex items-center justify-center text-muted-foreground/60 " +
                            "hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 " +
                            "transition-colors"
                          }
                          title={t("tasks.sidebar.remove")}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : task.assignedTo ? (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="size-6 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[9px] font-semibold text-foreground">{personInitials(task.assignedTo)}</span>
              </div>
              <Link
                href={`/members/${task.assignedTo.id}`}
                className={"text-xs font-medium text-foreground hover:text-blue-600 " + "transition-colors"}
              >
                {personName(task.assignedTo)}
              </Link>
            </div>
          ) : (
            <button
              onClick={canEdit ? onAssignClick : undefined}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed " +
                  "border-border/60 text-xs text-muted-foreground/50",
                canEdit && "hover:border-foreground/20 hover:text-muted-foreground cursor-pointer transition-colors",
              )}
            >
              <Plus className="size-3.5" />
              <span>{t("tasks.sidebar.assignSomeone")}</span>
            </button>
          )}
          {/* Or let a role take it: whoever holds it here and is free (shared tasks/role-pool.ts). */}
          <OpenToRoleAction task={task} canAssign={canAssign} />
        </div>

        {/*
          Due Date — the day the work happens, and the hour to be on site when
          one is named. `LeaveByLine` adds the departure underneath, so a
          dispatcher can see whether the day is actually possible.
        */}
        <SidebarRow icon={Calendar} label={t("tasks.sidebar.dueDate")}>
          <div>
            <InlineEditField
              value={task.dueDate}
              onSave={(v) => onFieldSave("dueDate", v)}
              type="date"
              disabled={!canEdit}
              placeholder={t("tasks.sidebar.setDueDate")}
            />
            <LeaveByLine task={task} />
          </div>
        </SidebarRow>

        {/* Start Date */}
        <SidebarRow icon={Calendar} label={t("tasks.sidebar.startDate")}>
          <InlineEditField
            value={task.startDate}
            onSave={(v) => onFieldSave("startDate", v)}
            type="date"
            disabled={!canEdit}
            placeholder={t("tasks.sidebar.setStartDate")}
          />
        </SidebarRow>

        {/* Location */}
        <SidebarRow icon={MapPin} label={t("tasks.sidebar.location")}>
          <div className="space-y-1 min-w-0">
            {task.space && (
              <Link
                href={`/locations`}
                className={
                  "text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 " +
                  "dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                }
              >
                {task.space.name}
                <ExternalLink className="size-2.5" />
              </Link>
            )}
            <InlineEditField
              value={task.locationAddress}
              onSave={(v) => onFieldSave("locationAddress", v)}
              type="text"
              disabled={!canEdit}
              placeholder={t("tasks.sidebar.addLocation")}
              renderDisplay={(v) =>
                v ? <span className="text-xs text-foreground/80 leading-snug break-words">{String(v)}</span> : null
              }
            />
          </div>
        </SidebarRow>

        {/* Estimated Hours */}
        <SidebarRow icon={Clock} label={t("tasks.sidebar.estimatedHours")}>
          <InlineEditField
            value={task.estimatedHours}
            onSave={(v) => onFieldSave("estimatedHours", v)}
            type="number"
            disabled={!canEdit}
            placeholder="—"
            renderDisplay={(v) => (v != null && String(v) !== "" ? `${v}h` : null)}
          />
        </SidebarRow>

        {/* Created By */}
        <SidebarRow icon={User} label={t("tasks.sidebar.createdBy")}>
          <span className="text-sm text-foreground">{task.createdBy ? personName(task.createdBy) : "—"}</span>
        </SidebarRow>

        {/* Created Date */}
        <SidebarRow icon={Calendar} label={t("tasks.sidebar.created")}>
          <span className="text-sm text-muted-foreground">{formatMediumDate(task.createdAt)}</span>
        </SidebarRow>
      </div>
    </div>
  )
}
