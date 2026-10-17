"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { epicsApi, type Epic } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { cn } from "@/lib/utils"
import { DateField, EPIC_COLORS } from "./complete-sprint-dialog"

export function EpicFormDialog({
  open,
  onOpenChange,
  epic,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  epic?: Epic | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEdit = !!epic

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState(EPIC_COLORS[0]!)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined)

  const handleOpenChange = (v: boolean) => {
    if (v && epic) {
      setName(epic.name)
      setDescription(epic.description ?? "")
      setColor(epic.color ?? EPIC_COLORS[0]!)
      setStartDate(epic.startDate ? new Date(epic.startDate) : undefined)
      setTargetDate(epic.targetDate ? new Date(epic.targetDate) : undefined)
    } else if (v) {
      setName("")
      setDescription("")
      setColor(EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)]!)
      setStartDate(undefined)
      setTargetDate(undefined)
    }
    onOpenChange(v)
  }

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) =>
      epicsApi.create(data),
    onSuccess: () => {
      notify.success(t("tasks.epic.created"))
      queryClient.invalidateQueries({ queryKey: keys.epics.lists() })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) =>
      epicsApi.update(epic!.id, data),
    onSuccess: () => {
      notify.success(t("tasks.epic.updated"))
      queryClient.invalidateQueries({ queryKey: keys.epics.lists() })
      handleOpenChange(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const isValid = name.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || isPending) return
    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      startDate: startDate?.toISOString(),
      targetDate: targetDate?.toISOString(),
    }
    if (isEdit) updateMutation.mutate(data)
    else createMutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("tasks.epic.editTitle") : t("tasks.epic.createTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t("tasks.epic.editDescription") : t("tasks.epic.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="epic-name" className="text-sm">{t("tasks.fields.name")}</Label>
            <Input
              id="epic-name"
              placeholder={t("tasks.epic.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              className="h-9 rounded-lg"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">{t("tasks.fields.color")}</Label>
            <div className="flex items-center gap-1.5">
              {EPIC_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-105",
                  )}
                  style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="epic-description" className="text-sm">{t("tasks.description.label")}</Label>
            <Textarea
              id="epic-description"
              placeholder={t("tasks.epic.descriptionPlaceholder")}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              className="rounded-lg resize-none text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label={t("tasks.sidebar.startDate")}
              value={startDate}
              onSelect={setStartDate}
              placeholder={t("common.optional")}
              disabled={isPending}
            />

            <DateField
              label={t("tasks.epic.targetDate")}
              value={targetDate}
              onSelect={setTargetDate}
              placeholder={t("common.optional")}
              disabled={isPending}
            />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!isValid || isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? (
                <><Loader2 className="mr-1.5 size-3.5 animate-spin" />{t("common.saving")}</>
              ) : isEdit ? t("common.saveChanges") : t("tasks.epic.createTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Sprint Dialog ────────────────────────────────────────────────────

export function DeleteSprintDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tasks.sprint.deleteTitle")}
      description={t("tasks.sprint.deleteDescription")}
      confirmLabel={
        <>
          {isPending && <Loader2 className="size-4 animate-spin mr-1" />}
          {t("common.delete")}
        </>
      }
      onConfirm={onConfirm}
      destructive
      cancelDisabled={isPending}
      confirmDisabled={isPending}
    />
  )
}
