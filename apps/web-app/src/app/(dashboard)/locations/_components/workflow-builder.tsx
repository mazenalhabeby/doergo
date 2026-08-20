"use client"

import { useState, useCallback, useRef, useEffect, memo } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { Plus, X, Loader2, AlertCircle, Upload } from "lucide-react"

import { workflowsApi, type WorkflowStatus } from "@/lib/api"
import { resolveTransitions, toStatusKey } from "@/lib/workflow-transitions"
import { workflowAdvice } from "@hbcfield/shared/client"
import { CustomFieldsManager } from "@/components/custom-fields-manager"
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
  /**
   * Where this step can go next.
   *
   * Carried through untouched when it already exists. This editor has no
   * transition control, so synthesising a chain on save would quietly flatten a
   * branching flow — the return path out of "Blocked" on a template forked from
   * the library would be gone the first time somebody renamed a step here.
   * A chain is only invented for a step that has none.
   */
  transitions?: string[]
  /**
   * What the member does at this step — gps, timer, photos, signature…
   *
   * This editor did not hold them, so anything built here was a status machine
   * with no work in it: a flow that could only change colour. They are here now,
   * which also means a template from the library keeps its behaviour when it
   * lands in this screen instead of arriving stripped.
   */
  capabilities?: string[]
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

/**
 * Starter flows come from the LIBRARY, not from a list in this file.
 *
 * There used to be one here, one in shared, and one in the database — three
 * answers to "what does Field Service look like", drifting apart. The library
 * is the one that a curator can add to without a deploy, and the one whose
 * templates carry capabilities and transitions rather than just names and
 * colours.
 */
interface Template {
  id: string
  name: string
  statuses: { name: string; color: string; isFinal: boolean; isCanceled: boolean; capabilities?: string[] }[]
}


/**
 * The capabilities a step can ask for, and the module each one needs.
 *
 * Keys match `CAPABILITY_MODULE` in shared — the server derives the module
 * requirement from them, so this list is a label set, not a second source of
 * truth about what they mean.
 */
const BUILDER_CAPABILITIES = [
  { key: "gps", labelKey: "workflows.capabilities.gps", label: "GPS", hintKey: "workflows.capabilities.gpsHint", hint: "Records the route while the member is at this step. Needs Route tracking." },
  { key: "timer", labelKey: "workflows.capabilities.timer", label: "Timer", hintKey: "workflows.capabilities.timerHint", hint: "Counts time on the job. Needs Time tracking." },
  { key: "checklist", labelKey: "workflows.capabilities.checklist", label: "Checklist", hintKey: "workflows.capabilities.checklistHint", hint: "A list to work through. Needs Checklists." },
  { key: "photos", labelKey: "workflows.capabilities.photos", label: "Photos", hintKey: "workflows.capabilities.photosHint", hint: "Before/after or evidence photos. Needs Attachments." },
  { key: "signature", labelKey: "workflows.capabilities.signature", label: "Signature", hintKey: "workflows.capabilities.signatureHint", hint: "Customer sign-off. Needs Service reports." },
  { key: "report", labelKey: "workflows.capabilities.report", label: "Report", hintKey: "workflows.capabilities.reportHint", hint: "Work performed and parts used. Needs Service reports." },
  { key: "form", labelKey: "workflows.capabilities.form", label: "Form", hintKey: "workflows.capabilities.formHint", hint: "Visit notes or an outcome form. Needs Custom fields." },
] as const

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

  const caps = status.capabilities ?? []
  const toggleCap = (key: string) =>
    onChange(index, {
      capabilities: caps.includes(key) ? caps.filter((c) => c !== key) : [...caps, key],
    })

  return (
    <div className="group space-y-1 py-0.5">
      <div className="flex items-center gap-2 h-9">
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

      {/*
        What the member DOES at this step.

        Without these a flow built here was a status machine with no work in
        it — a task could change colour and nothing else. Each one also decides
        a module the space has to have enabled, which the server checks when the
        type is offered, so the refusal names the switch to turn on.
      */}
      <div className="flex flex-wrap gap-1 pl-8 pr-8">
        {BUILDER_CAPABILITIES.map((cap) => {
          const on = caps.includes(cap.key)
          return (
            <button
              key={cap.key}
              type="button"
              onClick={() => toggleCap(cap.key)}
              title={t(cap.hintKey, cap.hint)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                on
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(cap.labelKey, cap.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
})

// ============================================================================
// WORKFLOW BUILDER
// ============================================================================

/*
  One key form for the whole screen.

  This used to lowercase while the generated transition targets uppercased, and
  it only worked because the server uppercases keys on write — a coincidence
  holding two halves of the same feature together. Both sides call the same
  function now.
*/
const toKey = toStatusKey


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

  // Published starter flows, shared across every organization. Cheap and
  // rarely changes, so it is cached rather than refetched per open.
  const { data: library = [] } = useQuery({
    queryKey: ["workflow-library"],
    queryFn: workflowsApi.library.list,
    staleTime: 5 * 60_000,
  })
  const templates: Template[] = library.map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    statuses: [...tpl.statuses]
      .sort((a, b) => a.position - b.position)
      .map((st) => ({
        name: st.name,
        color: st.color,
        isFinal: st.isFinal,
        isCanceled: st.isCanceled,
        capabilities: st.capabilities ?? [],
      })),
  }))

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
          capabilities: s.capabilities ?? [],
          transitions: s.transitions ?? [],
        }))
    }
    // Empty until the library loads — a starter flow is chosen, not assumed.
    // Guessing one meant somebody who wanted three steps had to delete six.
    return []
  })
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /*
    What practised flows have that this one does not — no cancel path, no way
    back out of a problem, work asked for after the work is over. Advice, never
    a refusal: a two-step flow is a legitimate choice, and an editor that argues
    with every decision stops being read.
  */
  const advice = workflowAdvice(
    statuses.map((st, i) => ({
      key: toKey(st.name),
      name: st.name,
      position: i,
      isFinal: st.isFinal,
      isCanceled: st.isCanceled,
      transitions: resolveTransitions(statuses, i),
      capabilities: st.capabilities ?? [],
    })),
  )

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
    // Capabilities come across with the steps. Dropping them was what made a
    // template applied here a hollow copy of the same one applied elsewhere.
    setStatuses(template.statuses.map((s, i) => ({ ...s, position: i })))
    setName((prev) => prev.trim() || template.name)
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
            transitions: resolveTransitions(validStatuses, i),
            capabilities: s.capabilities ?? [],
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
                transitions: resolveTransitions(validStatuses, i),
                capabilities: s.capabilities ?? [],
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
              transitions: resolveTransitions(validStatuses, i),
              capabilities: s.capabilities ?? [],
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
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tpl)}
              title={tpl.statuses.map((st) => st.name).join(" → ")}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {tpl.name}
            </button>
          ))}
          {templates.length === 0 && (
            <span className="text-xs text-muted-foreground/70">
              {t("workflows.builder.noTemplates", "No starter flows available.")}
            </span>
          )}
        </div>
      </div>

      {/*
        Everything below exists only while EDITING a saved task type, because
        each piece needs one that exists: fields hang off its id, advice reads
        its finished steps, and there is nothing to offer anyone until it is
        saved. These used to live on a separate card list; folding them in here
        is what let that second screen go.
      */}
      {mode === "edit" && workflowId && (
        <>
          {advice.length > 0 && (
            <div className="space-y-1">
              {advice.map((a) => (
                <p key={a.code} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="mt-px size-3.5 shrink-0" />
                  {a.message}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("workflows.builder.fields", "Fields collected on this task type")}
            </Label>
            <div className="rounded-lg border border-border bg-background p-2.5">
              <CustomFieldsManager workflowId={workflowId} />
            </div>
          </div>

          {/* Offering it SUBMITS it — a curator reads it before any other
              organization is offered it. The wording has to say so. */}
          <button
            type="button"
            disabled={submitting}
            title={t("workflows.page.submitHint", "Offer this flow to other organizations. It is reviewed first.")}
            onClick={async () => {
              setSubmitting(true)
              try {
                const r = await workflowsApi.submitToLibrary(workflowId)
                notify.success(
                  r?.resubmitted
                    ? t("workflows.page.toast.resubmitted", "Updated — it is waiting to be reviewed.")
                    : t("workflows.page.toast.submitted", "Sent for review. It reaches other organizations once approved."),
                )
              } catch (e) {
                notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
              } finally {
                setSubmitting(false)
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            {t("workflows.page.submitToLibrary", "Offer to library")}
          </button>
        </>
      )}

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
