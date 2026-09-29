"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CircleDot,
  GripVertical,
  Hash,
  Image as ImageIcon,
  PenLine,
  Plus,
  ToggleLeft,
  Type,
  X,
  AlertCircle,
  FileText,
  type LucideIcon,
} from "lucide-react"
import {
  STEP_FORM_FIELD_TYPES,
  STEP_FORM_LIMITS,
  STEP_FORM_PRESET_IDS,
  type StepFormField,
  type StepFormFieldType,
  type StepFormPresetId,
} from "@hbcfield/shared/client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  askNothingDraft,
  crmLinkFor,
  crmLinkFree,
  definitionErrors,
  moveField,
  newField,
  presetDraft,
  stepFieldLabel,
  type DefinitionErrors,
  type StepFormDraft,
} from "@/lib/step-forms"

const FIELD_TYPE_ICON: Record<StepFormFieldType, LucideIcon> = {
  note: AlignLeft,
  choice: CircleDot,
  photos: ImageIcon,
  signature: PenLine,
  name: Type,
  number: Hash,
  yesno: ToggleLeft,
  date: Calendar,
}

const TYPE_NAME: Record<StepFormFieldType, string> = {
  note: "Note",
  choice: "Choice",
  photos: "Photos",
  signature: "Signature",
  name: "Name",
  number: "Number",
  yesno: "Yes / no",
  date: "Date",
}

const PRESET_NAME: Record<StepFormPresetId, string> = {
  fieldService: "Field service",
  salesVisit: "Sales visit",
  delivery: "Delivery",
  inspection: "Inspection",
  support: "Support",
}

interface StepFormEditorProps {
  /** The step's name, for the preview. */
  stepName: string
  /** What the step asks as it stands: its own list, the standard report, or nothing. */
  mode: "own" | "legacy" | "none"
  draft: StepFormDraft
  onChange: (draft: StepFormDraft) => void
  /** May this person change it? Otherwise it is shown, not edited. */
  editable: boolean
  /** Does the space (else the organization) run the CRM? Offers the CRM links. */
  crmAvailable: boolean
  /** What the server refused on the last save, by field. */
  serverErrors?: DefinitionErrors
  /** Without its own list this step would ask the standard report — offer the way back to it. */
  standardAvailable?: boolean
}

/**
 * "Ask when a job moves here" — one step's list of questions.
 *
 * The same shape as the approved mockup: Start from a preset, the fields in
 * order (drag, or the arrows), each with its label, Optional/Required, a
 * choice's options and an optional CRM link, and "+ add" per type. Judged live
 * by the shared validator the server runs, so a save is refused here first.
 */
export function StepFormEditor({ stepName, mode, draft, onChange, editable, crmAvailable, serverErrors, standardAvailable }: StepFormEditorProps) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const fields = draft?.fields ?? []
  const live = definitionErrors(draft)
  const errorsFor = (id: string) => [...(live[id] ?? []), ...(serverErrors?.[id] ?? [])]
  const formErrors = [...(live["*"] ?? []), ...(serverErrors?.["*"] ?? [])]
  const defError = (code: string) =>
    t(`stepForm.definitionError.${code}`, { defaultValue: t("stepForm.definitionError.invalid", "This question is not valid."), max: STEP_FORM_LIMITS.maxFields })

  const setFields = (next: StepFormField[]) => onChange({ fields: next })
  const update = (i: number, patch: Partial<StepFormField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i: number) => setFields(fields.filter((_, j) => j !== i))

  const typeName = (type: StepFormFieldType) => t(`stepForm.type.${type}`, TYPE_NAME[type])

  // ── The standard report of a step with no list of its own ──
  if (mode === "legacy") {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3" data-testid="step-form-legacy">
        <p className="flex items-center gap-2 text-xs font-medium text-foreground">
          <FileText className="size-3.5 text-muted-foreground" />
          {t("stepForm.legacy.title", "Uses the standard field-service report")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("stepForm.legacy.body", "The assigned member is asked what they did, before and after photos, both signatures and the customer's name. Customise it to ask your own questions, or ask nothing here.")}
        </p>
        {editable && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onChange(presetDraft("fieldService", tr))}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              {t("stepForm.legacy.customise", "Customise")}
            </button>
            <button
              type="button"
              onClick={() => onChange(askNothingDraft())}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("stepForm.legacy.askNothing", "Ask nothing")}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_220px]" data-testid="step-form-editor">
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

      <StepFormPreview stepName={stepName} fields={fields} />
    </div>
  )
}

/** A choice's options: add, remove, reorder. Two to twelve. */
function OptionsEditor({ options, editable, onChange }: { options: string[]; editable: boolean; onChange: (o: string[]) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1 pl-6">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1">
          <CircleDot className="size-3 shrink-0 text-muted-foreground" />
          {editable ? (
            <Input
              value={o}
              onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={STEP_FORM_LIMITS.maxOptionLength + 10}
              placeholder={t("stepForm.optionPlaceholder", "Option")}
              aria-label={t("stepForm.optionPlaceholder", "Option")}
              className="h-6 flex-1 text-[11px]"
            />
          ) : (
            <span className="text-[11px]">{o}</span>
          )}
          {editable && (
            <>
              <button type="button" disabled={i === 0} onClick={() => onChange(moveField(options, i, i - 1))} aria-label={t("stepForm.moveUp", "Move up")} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowUp className="size-3" />
              </button>
              <button type="button" disabled={i === options.length - 1} onClick={() => onChange(moveField(options, i, i + 1))} aria-label={t("stepForm.moveDown", "Move down")} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowDown className="size-3" />
              </button>
              <button
                type="button"
                disabled={options.length <= 2}
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                aria-label={t("stepForm.removeOption", "Remove option")}
                className="p-0.5 text-muted-foreground hover:text-red-500 disabled:opacity-30"
              >
                <X className="size-3" />
              </button>
            </>
          )}
        </div>
      ))}
      {editable && options.length < STEP_FORM_LIMITS.maxOptions && (
        <button type="button" onClick={() => onChange([...options, ""])} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
          <Plus className="size-3" />
          {t("stepForm.addOption", "Add option")}
        </button>
      )}
    </div>
  )
}

/** What the member sees — a small phone-shaped preview, like the mockup's. */
function StepFormPreview({ stepName, fields }: { stepName: string; fields: StepFormField[] }) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const required = fields.filter((f) => f.required).length
  const well = "rounded-xl bg-black/40 p-2 space-y-1.5"
  const box = "rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-slate-400"
  return (
    <div className="hidden lg:block" aria-hidden>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("stepForm.preview", "Preview")}</p>
      <div className="rounded-[28px] bg-[#111417] p-1.5 shadow-lg">
        <div className="min-h-[280px] space-y-2 rounded-[22px] bg-gradient-to-b from-[#0c1417] to-[#040507] p-3 text-slate-100">
          <div className="mx-auto h-1 w-8 rounded bg-slate-500/40" />
          <p className="text-sm font-light">{stepName || "—"}</p>
          <p className="text-[10px] text-slate-400">
            {fields.length
              ? t("stepForm.dialog.caption", { required, count: fields.length, defaultValue: "{{required}} required · {{count}} fields, from the workflow" })
              : t("stepForm.previewNothing", "This step asks nothing — one tap and the job moves.")}
          </p>
          {fields.map((f) => (
            <div key={f.id} className={well}>
              <div className="flex justify-between gap-2 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                <span className="truncate">{stepFieldLabel(f, tr) || "—"}</span>
                <span className={f.required ? "text-emerald-300" : ""}>
                  {f.required ? t("stepForm.required", "Required") : t("stepForm.optional", "Optional")}
                </span>
              </div>
              {f.type === "choice" ? (
                <div className="flex flex-wrap gap-1">
                  {(f.options ?? []).filter(Boolean).map((o, i) => (
                    <span key={i} className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-slate-300">{o}</span>
                  ))}
                </div>
              ) : f.type === "photos" ? (
                <div className="grid grid-cols-4 gap-1">
                  <i className="aspect-square rounded-md border border-dashed border-white/15" />
                  <i className="aspect-square rounded-md border border-dashed border-white/15" />
                </div>
              ) : f.type === "signature" ? (
                <div className="h-8 rounded-md border border-dashed border-white/15" />
              ) : f.type === "yesno" ? (
                <div className="flex gap-1">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">{t("stepForm.dialog.yes", "Yes")}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px]">{t("stepForm.dialog.no", "No")}</span>
                </div>
              ) : (
                <div className={box}>
                  {f.type === "date" ? t("stepForm.dialog.datePlaceholder", "Pick a day") : f.type === "number" ? "0" : t("stepForm.dialog.notePlaceholder", "Type here…")}
                </div>
              )}
            </div>
          ))}
          <div className="rounded-full bg-gradient-to-b from-[#7fe6c8] to-[#10b993] py-1.5 text-center text-[11px] font-medium text-[#001810]">
            {stepName || "—"}
          </div>
        </div>
      </div>
    </div>
  )
}
