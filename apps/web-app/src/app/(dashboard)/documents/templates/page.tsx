"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FileSignature, Plus, Loader2, AlertTriangle, PenSquare, Trash2, ArrowLeft,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  documentsApi, organizationsApi,
  type ContractTemplateRow, type DocumentTypeRow,
} from "@/lib/api"
import { MERGE_FIELDS, unknownTokens } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  Contract templates.

  A template is bound to a ROLE and a JOB TITLE — the two things an invitation
  already carries — so when somebody accepts, the system knows which contract
  applies without anyone choosing.

  Two things this editor does that a plain textarea would not:

  1. IT LISTS THE FIELDS AND INSERTS THEM. Nobody should have to remember
     whether it is {{member.jobTitle}} or {{member.position}}, and a token that
     does not exist produces a contract with braces printed in it.

  2. IT VALIDATES AS YOU TYPE, against the same catalogue the server checks.
     Finding out at issue time means finding out during somebody's onboarding.
*/

const SIGNATURE_MODES = ["IN_APP", "ACKNOWLEDGE", "WET_INK", "NONE"] as const

export default function TemplatesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<ContractTemplateRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: templates = [], isLoading } = useQuery<ContractTemplateRow[]>({
    queryKey: ["document-templates"],
    queryFn: () => documentsApi.listTemplates(),
  })
  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types"],
    queryFn: () => documentsApi.listTypes(),
  })
  /* The org-scope roles an invitation can name — the same list the Access tab
     uses, so a template binds to a role that actually exists. */
  const { data: roles = [] } = useQuery({
    queryKey: ["org-roles"],
    queryFn: () => organizationsApi.getRoles("org"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.deactivateTemplate(id),
    onSuccess: () => {
      notify.success(t("documents.templates.retired"))
      queryClient.invalidateQueries({ queryKey: ["document-templates"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (editing || creating) {
    return (
      <TemplateEditor
        template={editing}
        types={types}
        roles={roles}
        onClose={() => { setEditing(null); setCreating(false) }}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("documents.templates.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.templates.subtitle")}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={types.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          {t("documents.templates.new")}
        </Button>
      </header>

      {types.length === 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t("documents.templates.needTypeFirst")}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <FileSignature className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("documents.templates.empty")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.templates.emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{tpl.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    v{tpl.version}
                  </span>
                  <ModeChip mode={tpl.signatureMode} />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {tpl.type?.label}
                  {" · "}
                  {tpl.appliesToRole?.name || tpl.appliesToPosition
                    ? [tpl.appliesToRole?.name, tpl.appliesToPosition].filter(Boolean).join(" · ")
                    : t("documents.templates.appliesToAll")}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(tpl)} aria-label={t("common.edit")}>
                  <PenSquare className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(tpl.id)} aria-label={t("common.delete")}>
                  <Trash2 className="h-4 w-4 text-slate-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ModeChip({ mode }: { mode: string }) {
  const { t } = useTranslation()
  const map: Record<string, string> = {
    IN_APP: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    ACKNOWLEDGE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    // Amber, not red: it is not a fault, it is a legal fact about the document.
    WET_INK: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    NONE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  }
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", map[mode])}>
      {t(`documents.templates.modes.${mode.toLowerCase()}`)}
    </span>
  )
}

function TemplateEditor({
  template, types, roles, onClose,
}: {
  template: ContractTemplateRow | null
  types: DocumentTypeRow[]
  roles: { id: string; name: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [name, setName] = useState(template?.name ?? "")
  const [typeId, setTypeId] = useState(template?.typeId ?? types[0]?.id ?? "")
  const [body, setBody] = useState(template?.body ?? "")
  const [roleId, setRoleId] = useState(template?.appliesToRoleId ?? "")
  const [position, setPosition] = useState(template?.appliesToPosition ?? "")
  const [mode, setMode] = useState<string>(template?.signatureMode ?? "IN_APP")

  /* Validated against the SAME catalogue the server checks, so the editor and
     the API can never disagree about what a valid template is. */
  const unknown = useMemo(() => unknownTokens(body), [body])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        typeId, name, body,
        appliesToRoleId: roleId || undefined,
        appliesToPosition: position || undefined,
        signatureMode: mode,
      }
      return template
        ? documentsApi.updateTemplate(template.id, payload)
        : documentsApi.createTemplate(payload)
    },
    onSuccess: () => {
      notify.success(template ? t("documents.templates.saved") : t("documents.templates.created"))
      queryClient.invalidateQueries({ queryKey: ["document-templates"] })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const insert = (token: string) => setBody((b) => `${b}{{${token}}}`)
  const canSave = !!name.trim() && !!typeId && !!body.trim() && unknown.length === 0

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={onClose}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.templates.title")}
      </button>

      <h1 className="mb-5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {template ? t("documents.templates.edit") : t("documents.templates.new")}
      </h1>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Field label={t("documents.templates.name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("documents.templates.documentType")}>
              <Select value={typeId} onChange={setTypeId}
                options={types.map((ty) => ({ value: ty.id, label: ty.label }))} />
            </Field>
            <Field label={t("documents.templates.signatureMode")}>
              <Select value={mode} onChange={setMode}
                options={SIGNATURE_MODES.map((m) => ({
                  value: m, label: t(`documents.templates.modes.${m.toLowerCase()}`),
                }))} />
            </Field>
          </div>

          {mode === "WET_INK" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-slate-300">
              {t("documents.templates.wetInkNotice")}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("documents.templates.role")} hint={t("documents.templates.anyRole")}>
              <Select value={roleId} onChange={setRoleId}
                options={[{ value: "", label: t("documents.templates.anyRole") },
                          ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
            </Field>
            <Field label={t("documents.templates.jobTitle")} hint={t("documents.templates.anyJobTitle")}>
              <Input value={position} onChange={(e) => setPosition(e.target.value)}
                placeholder={t("documents.templates.anyJobTitle")} />
            </Field>
          </div>

          <Field label={t("documents.templates.body")}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              spellCheck
              className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder={t("documents.templates.bodyPlaceholder")}
            />
          </Field>

          {unknown.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-slate-700 dark:text-slate-300">
                {t("documents.templates.unknownFields")}{" "}
                <span className="font-mono">{unknown.join(", ")}</span>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>

        {/* The field list. Click to insert — nobody should have to remember
            whether it is jobTitle or position. */}
        <aside className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t("documents.templates.fields")}
          </h2>
          <ul className="space-y-1">
            {MERGE_FIELDS.map((f) => (
              <li key={f.token}>
                <button
                  onClick={() => insert(f.token)}
                  className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left hover:bg-white dark:hover:bg-slate-800"
                >
                  <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                    {f.token}
                  </span>
                  <span className="truncate text-[11px] text-slate-400">{f.example}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {t("documents.templates.fieldsHint")}
          </p>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

function Select({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
