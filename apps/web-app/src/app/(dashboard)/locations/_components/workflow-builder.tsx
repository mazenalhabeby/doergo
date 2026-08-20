"use client"

import { useState, useCallback, useRef, useEffect, memo } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { Plus, X, Loader2, AlertCircle } from "lucide-react"

import { workflowsApi, type WorkflowStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ColorPicker, PRESET_COLORS } from "./color-picker"

// ============================================================================
// TYPES
// ============================================================================

interface StatusEntry {
  id?: string // exists if editing an existing status
  name: string
  color: string
  isFinal: boolean
  isCanceled: boolean
  position: number
}

interface WorkflowBuilderProps {
  mode: "create" | "edit"
  workflowId?: string
  workflowName?: string
  initialStatuses?: WorkflowStatus[]
  onCreated?: (workflowId: string) => void
  onSaved?: () => void
  onCancel: () => void
}

// ============================================================================
// TEMPLATES
// ============================================================================

interface Template {
  label: string
  labelKey: string
  statuses: Omit<StatusEntry, "id" | "position">[]
}

const TEMPLATES: Template[] = [
  {
    label: "Simple",
    labelKey: "workflows.templateLabels.simple",
    statuses: [
      { name: "Open", color: "#3b82f6", isFinal: false, isCanceled: false },
      { name: "In Progress", color: "#f59e0b", isFinal: false, isCanceled: false },
      { name: "Done", color: "#22c55e", isFinal: true, isCanceled: false },
    ],
  },
  {
    label: "Field Service",
    labelKey: "workflows.templateLabels.fieldService",
    statuses: [
      { name: "New", color: "#3b82f6", isFinal: false, isCanceled: false },
      { name: "Assigned", color: "#8b5cf6", isFinal: false, isCanceled: false },
      { name: "En Route", color: "#06b6d4", isFinal: false, isCanceled: false },
      { name: "Arrived", color: "#f59e0b", isFinal: false, isCanceled: false },
      { name: "Working", color: "#f97316", isFinal: false, isCanceled: false },
      { name: "Done", color: "#22c55e", isFinal: true, isCanceled: false },
    ],
  },
  {
    label: "Logistics",
    labelKey: "workflows.templateLabels.logistics",
    statuses: [
      { name: "Pending", color: "#64748b", isFinal: false, isCanceled: false },
      { name: "Picked Up", color: "#8b5cf6", isFinal: false, isCanceled: false },
      { name: "In Transit", color: "#3b82f6", isFinal: false, isCanceled: false },
      { name: "Out for Delivery", color: "#f59e0b", isFinal: false, isCanceled: false },
      { name: "Delivered", color: "#22c55e", isFinal: true, isCanceled: false },
    ],
  },
  {
    label: "Software",
    labelKey: "workflows.templateLabels.software",
    statuses: [
      { name: "Backlog", color: "#64748b", isFinal: false, isCanceled: false },
      { name: "To Do", color: "#3b82f6", isFinal: false, isCanceled: false },
      { name: "In Progress", color: "#f59e0b", isFinal: false, isCanceled: false },
      { name: "Review", color: "#8b5cf6", isFinal: false, isCanceled: false },
      { name: "Testing", color: "#06b6d4", isFinal: false, isCanceled: false },
      { name: "Done", color: "#22c55e", isFinal: true, isCanceled: false },
    ],
  },
  {
    label: "Support",
    labelKey: "workflows.templateLabels.support",
    statuses: [
      { name: "Open", color: "#3b82f6", isFinal: false, isCanceled: false },
      { name: "Triaging", color: "#8b5cf6", isFinal: false, isCanceled: false },
      { name: "In Progress", color: "#f59e0b", isFinal: false, isCanceled: false },
      { name: "Waiting", color: "#f97316", isFinal: false, isCanceled: false },
      { name: "Resolved", color: "#22c55e", isFinal: true, isCanceled: false },
      { name: "Closed", color: "#64748b", isFinal: true, isCanceled: false },
    ],
  },
]

// ============================================================================
// STATUS ROW
// ============================================================================

const StatusRow = memo(function StatusRow({
  status,
  index,
  isFirst,
  total,
  onChange,
  onRemove,
  autoFocus,
}: {
  status: StatusEntry
  index: number
  isFirst: boolean
  total: number
  onChange: (index: number, updates: Partial<StatusEntry>) => void
  onRemove: (index: number) => void
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  const getTypeBadge = () => {
    if (isFirst) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400 shrink-0">
          {t("workflows.start")}
        </Badge>
      )
    }
    if (status.isFinal && !status.isCanceled) {
      return (
        <button
          type="button"
          onClick={() => onChange(index, { isFinal: false })}
          className="shrink-0"
        >
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950">
            {t("workflows.final")}
          </Badge>
        </button>
      )
    }
    if (status.isCanceled) {
      return (
        <button
          type="button"
          onClick={() => onChange(index, { isCanceled: false, isFinal: false })}
          className="shrink-0"
        >
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-red-200 text-red-600 dark:border-red-800 dark:text-red-400 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950">
            {t("workflows.canceled")}
          </Badge>
        </button>
      )
    }
    // Show selectable options
    return (
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onChange(index, { isFinal: true, isCanceled: false })}
          className="text-[10px] text-muted-foreground hover:text-emerald-600 transition-colors"
        >
          {t("workflows.builder.markFinal")}
        </button>
        <span className="text-[10px] text-muted-foreground">/</span>
        <button
          type="button"
          onClick={() => onChange(index, { isCanceled: true, isFinal: true })}
          className="text-[10px] text-muted-foreground hover:text-red-600 transition-colors"
        >
          {t("workflows.builder.markCancel")}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 h-9 group">
      <ColorPicker
        value={status.color}
        onChange={(color) => onChange(index, { color })}
      />
      <Input
        ref={inputRef}
        value={status.name}
        onChange={(e) => onChange(index, { name: e.target.value })}
        placeholder={t("workflows.builder.statusNamePlaceholder")}
        className="h-8 text-sm flex-1"
      />
      {getTypeBadge()}
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={total <= 1}
        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
        aria-label={t("workflows.builder.removeStatus")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})

// ============================================================================
// WORKFLOW BUILDER
// ============================================================================

function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}


/**
 * Wire each step to the next one, and every working step to the cancel step.
 *
 * This builder holds names, colours and the finished/cancelled marks — it has
 * no transition editor. It used to write statuses with NO transitions at all,
 * which was harmless once and is not any more: a step with no way out and no
 * "finished" mark is a dead end, so the validator refuses the whole task type
 * the moment somebody offers it in a space. A type you can create and then
 * never use is worse than one you could not create.
 *
 * A straight chain is what this editor's list already implies. Anyone needing
 * branching gets it in the space's own Task Types editor, which has one.
 */
function linearTransitions(
  statuses: { name: string; isFinal: boolean; isCanceled: boolean }[],
  index: number,
): string[] {
  const current = statuses[index]
  if (!current || current.isFinal || current.isCanceled) return []

  const out: string[] = []
  const next = statuses.slice(index + 1).find((s) => !s.isCanceled)
  if (next) out.push(toKey(next.name))

  const cancel = statuses.find((s) => s.isCanceled)
  if (cancel && cancel !== current) out.push(toKey(cancel.name))

  return out
}

const WorkflowBuilder = memo(function WorkflowBuilder({
  mode,
  workflowId,
  workflowName: initialName,
  initialStatuses,
  onCreated,
  onSaved,
  onCancel,
}: WorkflowBuilderProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName || "")
  const [statuses, setStatuses] = useState<StatusEntry[]>(() => {
    if (initialStatuses && initialStatuses.length > 0) {
      return initialStatuses
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          isFinal: s.isFinal,
          isCanceled: s.isCanceled,
          position: s.position,
        }))
    }
    // Default: Simple template
    return TEMPLATES[0]!.statuses.map((s, i) => ({ ...s, position: i }))
  })
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleStatusChange = useCallback((index: number, updates: Partial<StatusEntry>) => {
    setStatuses((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    )
  }, [])

  const handleRemoveStatus = useCallback((index: number) => {
    setStatuses((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i }))
    })
  }, [])

  const handleAddStatus = useCallback(() => {
    setStatuses((prev) => {
      const colorIndex = prev.length % PRESET_COLORS.length
      const newStatus: StatusEntry = {
        name: "",
        color: PRESET_COLORS[colorIndex]!,
        isFinal: false,
        isCanceled: false,
        position: prev.length,
      }
      setLastAddedIndex(prev.length)
      return [...prev, newStatus]
    })
  }, [])

  const handleApplyTemplate = useCallback((template: Template) => {
    setStatuses(
      template.statuses.map((s, i) => ({ ...s, position: i }))
    )
    setLastAddedIndex(null)
  }, [])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      notify.error(t("workflows.builder.toast.nameRequired"))
      return
    }

    const validStatuses = statuses.filter((s) => s.name.trim())
    if (validStatuses.length === 0) {
      notify.error(t("workflows.builder.toast.statusRequired"))
      return
    }

    setIsSaving(true)
    try {
      if (mode === "create") {
        // Create the workflow
        const workflow = await workflowsApi.create({ name: trimmedName })
        if (!workflow) throw new Error(t("workflows.builder.toast.createFailedGeneric"))

        // Add statuses sequentially
        for (let i = 0; i < validStatuses.length; i++) {
          const s = validStatuses[i]!
          await workflowsApi.addStatus(workflow.id, {
            name: s.name.trim(),
            key: toKey(s.name),
            color: s.color,
            position: i,
            isFinal: s.isFinal,
            isCanceled: s.isCanceled,
            transitions: linearTransitions(validStatuses, i),
          })
        }

        queryClient.invalidateQueries({ queryKey: ["workflows"] })
        notify.success(t("workflows.builder.toast.created"))
        onCreated?.(workflow.id)
      } else if (mode === "edit" && workflowId) {
        // Update workflow name if changed
        if (trimmedName !== initialName) {
          await workflowsApi.update(workflowId, { name: trimmedName })
        }

        // Determine added, updated, and removed statuses
        const existingIds = new Set(
          (initialStatuses || []).map((s) => s.id)
        )
        const currentIds = new Set(
          validStatuses.filter((s) => s.id).map((s) => s.id!)
        )

        // Delete removed statuses
        for (const initial of initialStatuses || []) {
          if (!currentIds.has(initial.id)) {
            await workflowsApi.deleteStatus(workflowId, initial.id)
          }
        }

        // Add new statuses and update existing
        for (let i = 0; i < validStatuses.length; i++) {
          const s = validStatuses[i]!
          if (s.id && existingIds.has(s.id)) {
            // Update existing
            const original = initialStatuses?.find((os) => os.id === s.id)
            if (
              original &&
              (original.name !== s.name.trim() ||
                original.color !== s.color ||
                original.isFinal !== s.isFinal ||
                original.isCanceled !== s.isCanceled ||
                original.position !== i)
            ) {
              await workflowsApi.updateStatus(workflowId, s.id, {
                name: s.name.trim(),
                key: toKey(s.name),
                color: s.color,
                position: i,
                isFinal: s.isFinal,
                isCanceled: s.isCanceled,
                transitions: linearTransitions(validStatuses, i),
              })
            }
          } else {
            // Add new
            await workflowsApi.addStatus(workflowId, {
              name: s.name.trim(),
              key: toKey(s.name),
              color: s.color,
              position: i,
              isFinal: s.isFinal,
              isCanceled: s.isCanceled,
              transitions: linearTransitions(validStatuses, i),
            })
          }
        }

        queryClient.invalidateQueries({ queryKey: ["workflows"] })
        notify.success(t("workflows.builder.toast.updated"))
        onSaved?.()
      }
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : t("workflows.builder.toast.saveFailed")
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {mode === "create" ? t("workflows.builder.newWorkflow") : t("workflows.builder.editWorkflow")}
        </p>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="wf-name" className="text-xs">{t("workflows.name")}</Label>
        <Input
          id="wf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("workflows.builder.namePlaceholder")}
          className="h-8 text-sm"
          autoFocus={mode === "create"}
        />
      </div>

      {/*
        What is still missing, said while building rather than on save.

        Only the rules this editor can honestly evaluate: it holds names,
        colours and the finished/cancelled marks, not transitions, so the
        reachability and dead-end rules are checked server-side when the task
        type is attached to a space. Guessing at transitions here to run the
        full validator would be asserting on data the builder does not have.
      */}
      {statuses.length > 0 && !statuses.some((st) => st.isFinal) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {t(
            "workflows.builder.noFinalStatus",
            "Mark a step as finished — otherwise nothing on this task type can ever be completed.",
          )}
        </p>
      )}

      {/* Statuses */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t("workflows.builder.statuses")}</Label>
        <div className="rounded-lg border border-border bg-background p-2.5 space-y-1">
          {statuses.map((status, index) => (
            <StatusRow
              key={`${index}-${status.id || ""}`}
              status={status}
              index={index}
              isFirst={index === 0}
              total={statuses.length}
              onChange={handleStatusChange}
              onRemove={handleRemoveStatus}
              autoFocus={lastAddedIndex === index}
            />
          ))}
          <button
            type="button"
            onClick={handleAddStatus}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("workflows.builder.addStatus")}
          </button>
        </div>
      </div>

      {/* Templates */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("workflows.builder.templates")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => handleApplyTemplate(tpl)}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {t(tpl.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {mode === "create" ? t("common.creating") : t("common.saving")}
            </>
          ) : mode === "create" ? (
            t("workflows.builder.createWorkflow")
          ) : (
            t("common.saveChanges")
          )}
        </Button>
      </div>
    </div>
  )
})

export { WorkflowBuilder }
export type { WorkflowBuilderProps }
