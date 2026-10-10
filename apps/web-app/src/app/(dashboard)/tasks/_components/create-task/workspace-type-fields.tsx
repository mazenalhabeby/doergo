"use client"

import { useTranslation } from "react-i18next"
import { MapPin } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type CreateTaskForm } from "./use-create-task-form"

/** The workspace the task belongs to, and its task type (workflow). */
export function WorkspaceTypeFields({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    defaultCustomerId,
    spaceId,
    setSpaceId,
    workflowId,
    setWorkflowId,
    workflows,
    spaceWorkflowId,
    availableSpaces,
    hasSpaces,
    setCustomerId,
    setVisitAddressId,
    isSubmitting,
  } = form

  return (
    <>
      {/* Space selector */}
      {hasSpaces && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.groupBy.space")}</Label>
          <Select value={spaceId} onValueChange={(v) => {
              setSpaceId(v)
              setWorkflowId("inherit")
              // The client belongs to a workspace; changing it invalidates
              // the choice rather than silently keeping a client the new
              // workspace does not have.
              if (!defaultCustomerId) { setCustomerId("none"); setVisitAddressId("none") }
            }} disabled={isSubmitting || !!defaultCustomerId}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
              <SelectValue placeholder={t("tasks.create.selectSpace")} />
            </SelectTrigger>
            <SelectContent>
              {availableSpaces.map((s: { id: string; name: string }) => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-3 text-muted-foreground" />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Task Type (workflow) — only meaningful when the org has >1 workflow.
          Lets a task use a different flow than its space's default, so one
          space can hold tasks of several types. "Inherit" = the space default. */}
      {workflows.length > 1 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t("tasks.create.taskType", "Task type")}</Label>
          <Select value={workflowId} onValueChange={setWorkflowId} disabled={isSubmitting}>
            <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">
                {t("tasks.create.taskTypeInherit", "Workspace default")}
                {spaceWorkflowId
                  ? ` (${workflows.find((w) => w.id === spaceWorkflowId)?.name ?? ""})`
                  : ""}
              </SelectItem>
              {workflows.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )
}
