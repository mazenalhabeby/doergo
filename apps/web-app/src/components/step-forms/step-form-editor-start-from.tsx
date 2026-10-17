"use client"

import { ArrowDown, ArrowUp, GripVertical, Plus, X, AlertCircle } from "lucide-react"
import { STEP_FORM_FIELD_TYPES, STEP_FORM_LIMITS, STEP_FORM_PRESET_IDS } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  askNothingDraft,
  crmLinkFor,
  crmLinkFree,
  moveField,
  newField,
  presetDraft,
  stepFieldLabel,
} from "@/lib/step-forms"
import { FIELD_TYPE_ICON, PRESET_NAME, OptionsEditor } from "./step-form-editor-helpers"
import type { StepFormEditorState } from "./use-step-form-editor"
import type { StepFormEditor } from "./step-form-editor"

/** Part of StepFormEditor's markup, moved here unchanged; it reads the page's state from `vm`. */
export function StepFormEditorStartFrom({ vm, editable, onChange, standardAvailable, crmAvailable }: { vm: StepFormEditorState; editable: Parameters<typeof StepFormEditor>[0]['editable']; onChange: Parameters<typeof StepFormEditor>[0]['onChange']; standardAvailable: Parameters<typeof StepFormEditor>[0]['standardAvailable']; crmAvailable: Parameters<typeof StepFormEditor>[0]['crmAvailable'] }) {
  const {
    t,
    tr,
    fields,
    errorsFor,
    setDragFrom,
    dragFrom,
    setDragOver,
    setFields,
    dragOver,
    typeName,
    update,
    remove,
    defError,
    formErrors,
  } = vm
  return (
    <div className="space-y-2.5">
      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{t("stepForm.startFrom", "Start from")}:</span>
          {STEP_FORM_PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(presetDraft(id, tr))}
              className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
            >
              {t(`stepForm.preset.${id}`, PRESET_NAME[id])}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(askNothingDraft())}
            className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
          >
            {t("stepForm.preset.nothing", "Nothing")}
          </button>
          {standardAvailable && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("stepForm.legacy.backToStandard", "Use the standard report again")}
            </button>
          )}
        </div>
      )}

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("stepForm.empty", "Nothing is asked — the job just moves to this step.")}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {fields.map((field, i) => {
            const Icon = FIELD_TYPE_ICON[field.type]
            const errs = errorsFor(field.id)
            const link = crmLinkFor(field.type)
            const canLink = !!link && (crmAvailable || !!field.crm) && (field.crm === link || crmLinkFree(fields, link, field.id))
            return (
              <li
                key={field.id}
                data-testid="step-form-field"
                draggable={editable}
                onDragStart={(e) => {
                  setDragFrom(i)
                  e.dataTransfer.effectAllowed = "move"
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return
                  e.preventDefault()
                  setDragOver(i)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom !== null) setFields(moveField(fields, dragFrom, i))
                  setDragFrom(null)
                  setDragOver(null)
                }}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDragOver(null)
                }}
                className={cn(
                  "space-y-2 rounded-lg border bg-background p-2 transition-colors",
                  errs.length ? "border-red-400 dark:border-red-500/60" : "border-border",
                  dragOver === i && dragFrom !== i && "border-primary",
                  dragFrom === i && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  {editable && (
                    <span className="cursor-grab text-muted-foreground" title={t("stepForm.dragHint", "Drag to reorder")}>
                      <GripVertical className="size-3.5" />
                    </span>
                  )}
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={typeName(field.type)} />
                  {editable ? (
                    <Input
                      value={field.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      maxLength={STEP_FORM_LIMITS.maxLabelLength + 20}
                      placeholder={t("stepForm.labelPlaceholder", "Question")}
                      aria-label={t("stepForm.labelPlaceholder", "Question")}
                      className="h-7 flex-1 text-xs"
                    />
                  ) : (
                    <span className="flex-1 text-xs font-medium">{stepFieldLabel(field, tr)}</span>
                  )}
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">{typeName(field.type)}</span>
                  <div className="inline-flex shrink-0 rounded-full bg-muted p-0.5">
                    {[false, true].map((req) => (
                      <button
                        key={String(req)}
                        type="button"
                        disabled={!editable}
                        aria-pressed={field.required === req}
                        onClick={() => update(i, { required: req })}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-default",
                          field.required === req ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {req ? t("stepForm.required", "Required") : t("stepForm.optional", "Optional")}
                      </button>
                    ))}
                  </div>
                  {editable && (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => setFields(moveField(fields, i, i - 1))}
                        aria-label={t("stepForm.moveUp", "Move up")}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={i === fields.length - 1}
                        onClick={() => setFields(moveField(fields, i, i + 1))}
                        aria-label={t("stepForm.moveDown", "Move down")}
                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={t("stepForm.removeField", "Remove question")}
                        className="p-0.5 text-muted-foreground hover:text-red-500"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {field.type === "choice" && (
                  <OptionsEditor
                    options={field.options ?? []}
                    editable={editable}
                    onChange={(options) => update(i, { options })}
                  />
                )}

                {canLink && link && (
                  <label className="flex items-center gap-2 pl-6 text-[11px] text-muted-foreground">
                    {t("stepForm.crm.label", "Also write to the CRM")}
                    <select
                      disabled={!editable}
                      value={field.crm ?? ""}
                      onChange={(e) => update(i, { crm: e.target.value ? (e.target.value as "outcome" | "followUp") : undefined })}
                      className="h-6 rounded border border-border bg-background px-1 text-[11px] text-foreground"
                    >
                      <option value="">{t("stepForm.crm.none", "No")}</option>
                      <option value={link}>
                        {link === "outcome"
                          ? t("stepForm.crm.outcome", "As the visit outcome (a client note)")
                          : t("stepForm.crm.followUp", "As a follow-up reminder")}
                      </option>
                    </select>
                  </label>
                )}

                {errs.length > 0 && (
                  <p className="flex items-start gap-1.5 pl-6 text-[11px] text-red-600 dark:text-red-400" data-testid={`def-error-${field.id}`}>
                    <AlertCircle className="mt-px size-3 shrink-0" />
                    {defError(errs[0]!)}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {formErrors.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
          <AlertCircle className="mt-px size-3 shrink-0" />
          {defError(formErrors[0]!)}
        </p>
      )}

      {editable && fields.length < STEP_FORM_LIMITS.maxFields && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("stepForm.addField", "Add a field")}</p>
          <div className="flex flex-wrap gap-1">
            {STEP_FORM_FIELD_TYPES.map((type) => {
              const Icon = FIELD_TYPE_ICON[type]
              return (
                <button
                  key={type}
                  type="button"
                  data-testid={`add-${type}`}
                  onClick={() => setFields([...fields, newField(type, fields, tr)])}
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-primary hover:bg-muted"
                >
                  <Plus className="size-3" />
                  <Icon className="size-3" />
                  {typeName(type)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!editable && (
        <p className="text-[11px] text-muted-foreground">{t("stepForm.readOnly", "Only people who may edit workflows can change these questions.")}</p>
      )}
    </div>
  )
}
