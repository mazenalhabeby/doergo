"use client"

import { useTranslation } from "react-i18next"
import { Loader2, AlertTriangle, ArrowLeft, Users } from "lucide-react"
import { type ContractTemplateRow, type DocumentTypeRow, type MatchCandidateRow } from "@/lib/api"
import { MERGE_FIELDS, type StarterTemplate } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { SIGNATURE_MODES } from "../_lib/template-options"
import { useTemplateEditor } from "../_hooks/use-template-editor"
import { Step, Field, Select } from "./template-form-controls"
import { TemplatePreviewPane } from "./template-preview-pane"

export function TemplateEditor({
  template,
  starter,
  templates,
  types,
  roles,
  members,
  onClose,
}: {
  template: ContractTemplateRow | null
  starter: StarterTemplate | null
  templates: ContractTemplateRow[]
  types: DocumentTypeRow[]
  roles: { id: string; name: string }[]
  members: MatchCandidateRow[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const {
    name,
    setName,
    typeId,
    setTypeId,
    body,
    setBody,
    roleId,
    setRoleId,
    position,
    setPosition,
    mode,
    setMode,
    previewMode,
    setPreviewMode,
    unknown,
    reach,
    takenBy,
    sample,
    preview,
    save,
    insert,
    canSave,
  } = useTemplateEditor({ template, starter, templates, types, members, onClose })

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={onClose}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.templates.title")}
      </button>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {template ? t("documents.templates.edit") : t("documents.templates.new")}
      </h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* ── Left: three numbered steps ─────────────────────────────────── */}
        <div className="space-y-6">
          <Step n={1} title={t("documents.templates.step1")}>
            <div className="space-y-3">
              <Field label={t("documents.templates.name")}>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t("documents.templates.documentType")} hint={t("documents.templates.documentTypeHint")}>
                <Select
                  value={typeId}
                  onChange={setTypeId}
                  options={types.map((ty) => ({ value: ty.id, label: ty.label }))}
                />
              </Field>
            </div>
          </Step>

          <Step n={2} title={t("documents.templates.step2")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("documents.templates.role")}>
                <Select
                  value={roleId}
                  onChange={setRoleId}
                  options={[
                    { value: "", label: t("documents.templates.anyRole") },
                    ...roles.map((r) => ({ value: r.id, label: r.name })),
                  ]}
                />
              </Field>
              <Field label={t("documents.templates.jobTitle")}>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder={t("documents.templates.anyJobTitle")}
                />
              </Field>
            </div>

            {/* The answer to "did I set this up right?" */}
            <div
              className={cn(
                "mt-3 flex items-start gap-2.5 rounded-lg border p-3",
                reach.length === 0
                  ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                  : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50",
              )}
            >
              <Users
                className={cn("mt-0.5 h-4 w-4 shrink-0", reach.length === 0 ? "text-amber-600" : "text-slate-400")}
              />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {reach.length === 0
                    ? t("documents.templates.reachesNobody")
                    : t("documents.templates.reaches", { count: reach.length })}
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {reach.length > 0
                    ? reach
                        .slice(0, 8)
                        .map((m) => m.firstName)
                        .join(", ") + (reach.length > 8 ? ` +${reach.length - 8}` : "")
                    : takenBy.length > 0
                      ? t("documents.templates.alreadyCovered", {
                          templates: takenBy.map(([label]) => label).join(", "),
                        })
                      : t("documents.templates.reachesNobodyHint")}
                </p>
                {/* A sharper template winning people is not a warning; it is the
                    rule working. Only say so when it is not the whole story. */}
                {reach.length > 0 && takenBy.length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("documents.templates.othersTake", {
                      count: takenBy.reduce((n, [, c]) => n + c, 0),
                      templates: takenBy.map(([label]) => label).join(", "),
                    })}
                  </p>
                )}
              </div>
            </div>
          </Step>

          <Step n={3} title={t("documents.templates.step3")}>
            {/* Radio cards rather than a dropdown: four options, each with a
                real consequence, and a dropdown hides three of them. */}
            <div className="grid gap-2 sm:grid-cols-2">
              {SIGNATURE_MODES.map(({ key, Icon }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                    mode === key
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950/40"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-800",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      mode === key ? "text-blue-600 dark:text-blue-400" : "text-slate-400",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t(`documents.templates.modes.${key.toLowerCase()}`)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {t(`documents.templates.modeHints.${key.toLowerCase()}`)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Step>

          <Step n={4} title={t("documents.templates.step4")}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              spellCheck
              className={
                "w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm " +
                "leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 " +
                "dark:text-slate-100"
              }
              placeholder={t("documents.templates.bodyPlaceholder")}
            />

            {/* Fields as chips under the box, showing what each becomes. */}
            <p className="mb-1.5 mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("documents.templates.insertField")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.token}
                  onClick={() => insert(f.token)}
                  title={f.example}
                  className={
                    "rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 " +
                    "hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 " +
                    "dark:text-slate-400"
                  }
                >
                  {t(`documents.templates.fieldLabels.${f.token}`, { defaultValue: f.label })}
                </button>
              ))}
            </div>

            {unknown.length > 0 && (
              <div
                className={
                  "mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 " +
                  "p-3 text-sm dark:border-red-900 dark:bg-red-950/40"
                }
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-slate-700 dark:text-slate-300">
                  {t("documents.templates.unknownFields")} <span className="font-mono">{unknown.join(", ")}</span>
                </p>
              </div>
            )}
          </Step>

          <div className="flex justify-end gap-2 pb-4">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>

        <TemplatePreviewPane
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          sample={sample}
          body={body}
          preview={preview}
          types={types}
          typeId={typeId}
          name={name}
        />
      </div>
    </div>
  )
}
