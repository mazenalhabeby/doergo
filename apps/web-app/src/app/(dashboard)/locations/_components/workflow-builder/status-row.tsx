"use client"

import { useRef, useEffect, memo } from "react"
import { useTranslation } from "react-i18next"
import { X, ClipboardList } from "lucide-react"

import { toStatusKey } from "@/lib/workflow-transitions"
import { moduleI18n, STEP_CAPABILITY_MODULE } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ColorPicker } from "../color-picker"
import { StepFormEditor } from "@/components/step-forms/step-form-editor"
import { builderStepMode, definitionErrors } from "@/lib/step-forms"
import { BUILDER_CAPABILITIES } from "./capabilities"
import type { StatusEntry } from "./types"

// ============================================================================
// STATUS ROW
// ============================================================================

export const StatusRow = memo(function StatusRow({
  status,
  index,
  isFirst,
  total,
  onChange,
  onRemove,
  autoFocus,
  moduleOn,
  workflowName,
  formsEditable,
  crmAvailable,
  formOpen,
  onToggleForm,
}: {
  status: StatusEntry
  index: number
  isFirst: boolean
  total: number
  onChange: (index: number, updates: Partial<StatusEntry>) => void
  onRemove: (index: number) => void
  autoFocus?: boolean
  /** Is this module switched on in the space? Drives the amber warning. */
  moduleOn: (key: string) => boolean
  /** The flow's name — the shipped capability map is read by it for a step that says nothing. */
  workflowName: string
  /** May this person change what a step asks? */
  formsEditable: boolean
  /** Does the space run the CRM (so a question can write to it)? */
  crmAvailable: boolean
  formOpen: boolean
  onToggleForm: (index: number) => void
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
  // What this step asks as it stands: its own list, the standard report, or nothing.
  const stepShape = { key: toStatusKey(status.name), isFinal: status.isFinal, capabilities: caps }
  const formMode = builderStepMode({ ...stepShape, form: status.form }, workflowName)
  const standardAvailable = builderStepMode({ ...stepShape, form: null }, workflowName) === "legacy"
  const asked = formMode === "own" ? status.form?.fields.length ?? 0 : 0
  const formInvalid =
    Object.keys(definitionErrors(status.form)).length > 0 || Object.keys(status.formServerErrors ?? {}).length > 0
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
          // Selected, but the module it needs is off in this space — so the step
          // would ask for something that cannot happen. Said here, while it can
          // still be acted on, instead of only when the type is offered.
          const unmet = on && !moduleOn(STEP_CAPABILITY_MODULE[cap.key] ?? "")
          return (
            <button
              key={cap.key}
              type="button"
              onClick={() => toggleCap(cap.key)}
              title={
                unmet
                  ? t("workflows.capabilities.moduleOff", {
                      module: t(moduleI18n.label(STEP_CAPABILITY_MODULE[cap.key] ?? ""), {
                        defaultValue: STEP_CAPABILITY_MODULE[cap.key],
                      }),
                      defaultValue: 'The "{{module}}" module is off in this space, so this step cannot do it yet.',
                    })
                  : t(cap.hintKey, cap.hint)
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                unmet
                  ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  : on
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {unmet && "⚠ "}
              {t(cap.labelKey, cap.label)}
            </button>
          )
        })}
        {/*
          "Ask when a job moves here" — what a member answers when a job moves
          INTO this step. Any step can ask, not only the last.
        */}
        <button
          type="button"
          onClick={() => onToggleForm(index)}
          aria-expanded={formOpen}
          data-testid="step-form-toggle"
          className={`ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
            formInvalid
              ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
              : formOpen
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
        >
          <ClipboardList className="size-3" />
          {t("stepForm.tab", "Ask when moving here")}
          {formMode === "legacy"
            ? ` · ${t("stepForm.tabStandard", "standard report")}`
            : asked > 0
              ? ` · ${asked}`
              : ""}
        </button>
      </div>

      {formOpen && (
        <div className="pl-8 pr-8 pt-1">
          <StepFormEditor
            stepName={status.name}
            mode={formMode}
            draft={status.form}
            onChange={(form) => onChange(index, { form, formServerErrors: undefined })}
            editable={formsEditable}
            crmAvailable={crmAvailable}
            serverErrors={status.formServerErrors}
            standardAvailable={standardAvailable && formMode === "own"}
          />
        </div>
      )}
    </div>
  )
})
