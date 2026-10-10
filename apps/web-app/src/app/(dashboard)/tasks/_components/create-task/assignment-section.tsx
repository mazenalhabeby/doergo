"use client"

import { useTranslation } from "react-i18next"
import { User, Users, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { CollapsibleSection } from "./collapsible-section"
import { RoleAssignField } from "../role-assign-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { personName, personInitials, canReceiveTasks } from "@hbcfield/shared/client"
import { type CreateTaskForm } from "./use-create-task-form"

/** Who does it: the creator (self scope), named people, or a work role. */
export function AssignmentSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    spaceId,
    isSelfScope,
    showAssigneePicker,
    roleModeAvailable,
    assignMode,
    setAssignMode,
    openRole,
    setOpenRole,
    assigneeIds,
    setAssigneeIds,
    members,
    locationLat,
    locationLng,
    isSubmitting,
  } = form
  if (!(isSelfScope || showAssigneePicker)) return null

  return (
    <CollapsibleSection
      icon={Users}
      label={t("tasks.create.assignment")}
      indicator={isSelfScope ? t("tasks.create.assignedToYou") : null}
    >
      {isSelfScope ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
          <User className="size-3.5 text-blue-600" />
          <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">
            {t("tasks.create.assignedToYouFull")}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {roleModeAvailable && (
            <div role="group" aria-label={t("tasks.role.who")} className="mb-1 inline-grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {(["people", "role"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={assignMode === m}
                  onClick={() => setAssignMode(m)}
                  disabled={isSubmitting}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs transition-colors",
                    assignMode === m ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(m === "people" ? "tasks.role.byPerson" : "tasks.role.byRole")}
                </button>
              ))}
            </div>
          )}
          {roleModeAvailable && assignMode === "role" ? (
            <RoleAssignField
              spaceId={spaceId}
              lat={locationLat}
              lng={locationLng}
              value={openRole}
              onChange={setOpenRole}
              disabled={isSubmitting}
            />
          ) : (
          <>
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.create.assignTo")}</Label>

          {/* Who is on the task so far — removable, so a mistake is
              undone here rather than after the task exists. */}
          {assigneeIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {assigneeIds.map((id) => {
                const m = members.find((mm) => mm.id === id)
                if (!m) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2 py-0.5 text-xs"
                  >
                    <span className="size-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <span className="text-[7px] font-semibold text-white">
                        {personInitials(m)}
                      </span>
                    </span>
                    {personName(m)}
                    <button
                      type="button"
                      onClick={() => setAssigneeIds((prev) => prev.filter((x) => x !== id))}
                      disabled={isSubmitting}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t("common.remove", { defaultValue: "Remove" })}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/*
            Adds one at a time, because a task takes several people.
            Value stays empty so the same control can be used again —
            what is chosen lives in the chips above, not in the Select.
          */}
          <Select
            value=""
            onValueChange={(id) => setAssigneeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            disabled={isSubmitting}
          >
            <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
              <SelectValue placeholder={t("tasks.create.selectTeamMember")} />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => {
                const assignable = canReceiveTasks(member) && !assigneeIds.includes(member.id)
                return (
                  <SelectItem key={member.id} value={member.id} disabled={!assignable}>
                    <div className="flex items-center gap-2">
                      <div className="size-5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-semibold text-white">
                          {personInitials(member)}
                        </span>
                      </div>
                      <span>{personName(member)}</span>
                      {!assignable && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          · {t("tasks.create.cantReceiveTasks")}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          </>
          )}
        </div>
      )}
    </CollapsibleSection>
  )
}
