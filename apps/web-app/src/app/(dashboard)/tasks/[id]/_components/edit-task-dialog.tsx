"use client"

import { keys, invalidateTask } from "@/lib/query-keys"
import { useState, useEffect, lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Calendar as CalendarIcon, Loader2 } from "lucide-react"

import { tasksApi, phasesApi, sprintsApi, workflowsApi, type Task, type UpdateTaskInput } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhaseSelectContent, SprintSelectContent } from "../../_components/planning-select-options"
import { Textarea } from "@/components/ui/textarea"
import { timeOf, withTime } from "@/lib/due-time"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { PrioritySelector } from "@/components/tasks"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useEditTaskDialog, type EditTaskDialogProps } from "./use-edit-task-dialog"
import { LocationPicker } from "./edit-task-dialog-helpers"
import { EditTaskDialogSidebar } from "./edit-task-dialog-sidebar"

export function EditTaskDialog({ task, open, onOpenChange }: EditTaskDialogProps) {
  const vm = useEditTaskDialog({ task, open, onOpenChange })
  const {
    t,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    dueDate,
    setDueDate,
    dueTime,
    setDueTime,
    locationAddress,
    setLocationAddress,
    locationLat,
    setLocationLat,
    locationLng,
    setLocationLng,
    startDate,
    setStartDate,
    estimatedHours,
    setEstimatedHours,
    phaseId,
    setPhaseId,
    sprintId,
    setSprintId,
    workflowId,
    setWorkflowId,
    showPhases,
    showSprints,
    flows,
    phases,
    sprints,
    updateMutation,
    isFormValid,
    handleSubmit,
  } = vm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tasks.edit.title")}</DialogTitle>
          <DialogDescription>
            {t("tasks.edit.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium text-foreground">
              {t("tasks.columns.title")}<span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-title"
              placeholder={t("tasks.edit.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
              className="h-10 rounded-lg border-border bg-card"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium text-foreground">
              {t("tasks.description.label")}<span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="edit-description"
              placeholder={t("tasks.edit.descriptionPlaceholder")}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateMutation.isPending}
              className="rounded-lg border-border bg-card resize-none"
            />
          </div>

          {/*
            The map is full width.

            It used to share a two-column grid with Due Date, so the map's whole
            height sat empty beside a single date button — and the address was
            truncated to "Industriezentrum NÖ-Sü" in half the width it needed.
          */}
          <div className="space-y-2">
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="text-sm font-medium text-foreground">
                {t("tasks.create.serviceLocationLabel")}
              </Label>
              <Suspense
                fallback={
                  <div className="h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
                    <Loader2 className="size-5 text-muted-foreground animate-spin" />
                  </div>
                }
              >
                <LocationPicker
                  address={locationAddress}
                  lat={locationLat}
                  lng={locationLng}
                  variant="address"
                  onLocationChange={(lat, lng) => { setLocationLat(lat); setLocationLng(lng) }}
                  onAddressChange={setLocationAddress}
                  onClear={() => { setLocationLat(null); setLocationLng(null) }}
                  disabled={updateMutation.isPending}
                />
              </Suspense>
            </div>
          </div>

          {/*
            When the job is, on one line: the day, the hour to be on site, and
            how long it should take.

            ⚠️ "Be there at" is a FIELD, not something hidden inside the date
            popover. It was in the popover first, and it was invisible — nobody
            clicks a date they have already set, so the feature may as well not
            have existed. What a person can set, they must be able to SEE.
          */}
          <EditTaskDialogSidebar vm={vm} />

          {/*
            Start Date drives the timeline (Gantt) view and nothing else — no
            server rule reads it and the phone never shows it. Said on the form,
            because "Start Date" reads like the opposite of Due Date and it is
            not: the day the work happens is the DUE date.
          */}
          {/* Start Date */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                {t("tasks.sidebar.startDate")}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 w-full justify-start text-left font-normal rounded-lg border-border bg-card hover:bg-accent",
                      !startDate && "text-muted-foreground"
                    )}
                    disabled={updateMutation.isPending}
                  >
                    <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                    {startDate ? format(startDate, "MMM d, yyyy") : t("tasks.create.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">
                {t("tasks.sidebar.startDateHint", "Used to draw the bar on the timeline view. The day the work happens is the due date.")}
              </p>
            </div>

          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t("tasks.list.priority")}</Label>
            <PrioritySelector
              value={priority}
              onChange={setPriority}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Flow (task type / workflow) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t("tasks.edit.flow", "Flow")}</Label>
            <Select value={workflowId} onValueChange={setWorkflowId} disabled={updateMutation.isPending}>
              <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                <SelectValue placeholder={t("tasks.edit.flowSimple", "Simple flow")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.edit.flowSimple", "Simple flow")}</SelectItem>
                {(flows || []).map((wf) => (
                  <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("tasks.edit.flowHint", "Changing the flow updates the task's stages. Its status moves to the new flow's first stage if the current one doesn't exist there.")}</p>
          </div>

          {/* Phase & Sprint — only for spaces with the agile modules enabled */}
          {(showPhases || showSprints) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showPhases && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("tasks.sidebar.phase")}</Label>
              <Select value={phaseId} onValueChange={setPhaseId} disabled={updateMutation.isPending}>
                <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                  <SelectValue placeholder={t("tasks.sidebar.noPhase")} />
                </SelectTrigger>
                <PhaseSelectContent phases={phases} />
              </Select>
            </div>
            )}

            {showSprints && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("tasks.sidebar.sprint")}</Label>
              <Select value={sprintId} onValueChange={setSprintId} disabled={updateMutation.isPending}>
                <SelectTrigger className="h-10 rounded-lg border-border bg-card">
                  <SelectValue placeholder={t("tasks.sidebar.noSprint")} />
                </SelectTrigger>
                <SprintSelectContent sprints={sprints} />
              </Select>
            </div>
            )}
          </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                t("common.saveChanges")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
