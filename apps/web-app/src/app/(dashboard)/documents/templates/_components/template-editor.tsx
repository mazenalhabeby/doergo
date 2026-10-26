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
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Notice, PageHeader } from "@/components/page/page-kit"

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
    <div className={PAGE_SHELL}>
      <button
        onClick={onClose}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.templates.title")}
      </button>

      <PageHeader title={template ? t("documents.templates.edit") : t("documents.templates.new")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* ── Left: three numbered steps ─────────────────────────────────── */}
        <div className="space-y-3.5">
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
                "mt-3 flex items-start gap-2.5 rounded-[14px] p-3",
                reach.length === 0 ? "bg-shell-chip" : "bg-muted/50",
              )}
            >
              <Users
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  reach.length === 0 ? "text-shell-warn" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">
                  {reach.length === 0
                    ? t("documents.templates.reachesNobody")
                    : t("documents.templates.reaches", { count: reach.length })}
                </p>
                <p className="mt-0.5 text-muted-foreground">
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
                  <p className="mt-1 text-xs text-muted-foreground">
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
                      ? "border-primary bg-shell-accent-soft ring-1 ring-ring"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      mode === key ? "text-shell-accent" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {t(`documents.templates.modes.${key.toLowerCase()}`)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
                "w-full rounded-lg border border-border bg-card p-3 font-mono text-sm " +
                "leading-relaxed text-foreground " +
                ""
              }
              placeholder={t("documents.templates.bodyPlaceholder")}
            />

            {/* Fields as chips under the box, showing what each becomes. */}
            <p className="mb-1.5 mt-3 text-xs font-medium text-muted-foreground">
              {t("documents.templates.insertField")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f.token}
                  onClick={() => insert(f.token)}
                  title={f.example}
                  className={
                    "rounded-md border border-border px-2 py-1 text-xs text-muted-foreground " +
                    "hover:border-primary hover:text-shell-accent " +
                    ""
                  }
                >
                  {t(`documents.templates.fieldLabels.${f.token}`, { defaultValue: f.label })}
                </button>
              ))}
            </div>

            {unknown.length > 0 && (
              <Notice tone="crit" className="mb-0 mt-3 items-start">
                <AlertTriangle className="mt-0.5" />
                <p className="text-foreground">
                  {t("documents.templates.unknownFields")} <span className="font-mono">{unknown.join(", ")}</span>
                </p>
              </Notice>
            )}
          </Step>

          <div className="flex justify-end gap-2 pb-4">
            <Button variant="outline" size="pill" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="pillLg" onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
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
