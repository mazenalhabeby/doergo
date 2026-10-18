"use client"

import { useState, useCallback, memo } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Loader2 } from "lucide-react"

import { resolveTransitions } from "@/lib/workflow-transitions"
import { workflowAdvice, validateWorkflow } from "@hbcfield/shared/client"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PRESET_COLORS } from "./color-picker"
import { useAuth } from "@/contexts/auth-context"
import { draftFromStored } from "@/lib/step-forms"
import type { StatusEntry, Template, WorkflowBuilderProps } from "./workflow-builder/types"
import { StatusRow } from "./workflow-builder/status-row"
import { toKey, useWorkflowSave } from "./workflow-builder/use-workflow-save"
import { useWorkflowTemplates } from "./workflow-builder/use-workflow-templates"
import { WorkflowProblems } from "./workflow-builder/workflow-problems"
import { TypeCapabilityChips } from "./workflow-builder/type-capability-chips"
import { WorkflowTemplates } from "./workflow-builder/workflow-templates"
import { SavedWorkflowExtras } from "./workflow-builder/saved-workflow-extras"

// ============================================================================
// WORKFLOW BUILDER
// ============================================================================

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
  spaceId = null,
  initialTypeCapabilities,
  workflowId,
  workflowName: initialName,
  initialStatuses,
  onCreated,
  onSaved,
  onCancel,
}: WorkflowBuilderProps) {
  const { t } = useTranslation()

  const templates = useWorkflowTemplates()

  // What this SPACE has switched on. A capability whose module is off here is
  // decoration: the step would ask the member for something the space cannot do.
  const { hasModule } = useSpaceModules(spaceId)
  const { user, hasPermission } = useAuth()
  // Editing what a step asks is editing the workflow — the same people.
  const formsEditable = user?.role === "ADMIN" || hasPermission("canManageTaskTypes")
  // Without a space, the organization's own modules decide (useSpaceModules falls back).
  const crmAvailable = hasModule("crm")
  const [openForm, setOpenForm] = useState<number | null>(null)
  const toggleForm = useCallback((i: number) => setOpenForm((cur) => (cur === i ? null : i)), [])
  // Without a space (creating one), nothing is known to be off — so nothing is
  // warned about, rather than everything being warned about.
  const moduleOn = useCallback((key: string) => (spaceId ? hasModule(key) : true), [spaceId, hasModule])

  const [typeCapabilities, setTypeCapabilities] = useState<string[]>(initialTypeCapabilities ?? [])
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
          nameKey: s.nameKey ?? null,
          form: draftFromStored(s.form),
          initialForm: draftFromStored(s.form),
        }))
    }
    // Empty until the library loads — a starter flow is chosen, not assumed.
    // Guessing one meant somebody who wanted three steps had to delete six.
    return []
  })
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null)

  /*
    What practised flows have that this one does not — no cancel path, no way
    back out of a problem, work asked for after the work is over. Advice, never
    a refusal: a two-step flow is a legitimate choice, and an editor that argues
    with every decision stops being read.
  */
  const asFlow = () =>
    statuses.map((st, i) => ({
      key: toKey(st.name),
      name: st.name,
      position: i,
      isFinal: st.isFinal,
      isCanceled: st.isCanceled,
      transitions: resolveTransitions(statuses, i),
      capabilities: st.capabilities ?? [],
    }))

  /*
    What would REFUSE this task type, shown while it is being built.

    It was only ever shown at the moment somebody tried to offer the type in a
    space — as one sentence per fault, in a toast, which is unreadable at five
    steps and useless at ten. Here there is room, and the person is already
    looking at the thing to change.
  */
  const problems = validateWorkflow(asFlow())

  const advice = workflowAdvice(asFlow())

  const handleStatusChange = useCallback((index: number, updates: Partial<StatusEntry>) => {
    setStatuses((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    )
  }, [])

  const handleRemoveStatus = useCallback((index: number) => {
    setOpenForm(null)
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
        form: null,
        initialForm: null,
      }
      setLastAddedIndex(prev.length)
      return [...prev, newStatus]
    })
  }, [])

  const handleApplyTemplate = useCallback((template: Template) => {
    // Capabilities come across with the steps. Dropping them was what made a
    // template applied here a hollow copy of the same one applied elsewhere.
    // Forms too: a template's steps arrive with what they ask.
    setStatuses(
      template.statuses.map((s, i) => ({ ...s, position: i, nameKey: s.nameKey ?? null, form: s.form ?? null, initialForm: null })))
    setName((prev) => prev.trim() || template.name)
    setLastAddedIndex(null)
  }, [])

  const { isSaving, handleSave } = useWorkflowSave({
    mode,
    spaceId,
    workflowId,
    initialName,
    initialStatuses,
    name,
    statuses,
    typeCapabilities,
    setStatuses,
    setOpenForm,
    onCreated,
    onSaved,
  })

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
      {statuses.length > 0 && problems.length > 0 && <WorkflowProblems problems={problems} />}

      {/*
        What the TASK carries, as opposed to what a member does at a step.

        A task belongs to a sprint from creation to close — it is not "in a
        sprint at step three" — so these sit above the steps rather than on one.
        Twelve of the eighteen modules had no way to be declared by a task type
        before this row existed, which is why nothing could warn about them.
      */}
      <TypeCapabilityChips
        typeCapabilities={typeCapabilities}
        setTypeCapabilities={setTypeCapabilities}
        moduleOn={moduleOn}
      />

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
              moduleOn={moduleOn}
              workflowName={name}
              formsEditable={formsEditable}
              crmAvailable={crmAvailable}
              formOpen={openForm === index}
              onToggleForm={toggleForm}
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
      <WorkflowTemplates templates={templates} onApply={handleApplyTemplate} />

      {/*
        Everything below exists only while EDITING a saved task type, because
        each piece needs one that exists: fields hang off its id, advice reads
        its finished steps, and there is nothing to offer anyone until it is
        saved. These used to live on a separate card list; folding them in here
        is what let that second screen go.
      */}
      {mode === "edit" && workflowId && <SavedWorkflowExtras workflowId={workflowId} advice={advice} />}

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
