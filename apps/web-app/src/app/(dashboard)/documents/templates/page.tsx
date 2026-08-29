"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  FileSignature, Plus, Loader2, AlertTriangle, PenSquare, Trash2, ArrowLeft,
  Users, PenLine, CheckCheck, Printer, Ban, Eye, Download,
} from "lucide-react"
import {
  documentsApi, organizationsApi,
  type ContractTemplateRow, type DocumentTypeRow, type MatchCandidateRow,
} from "@/lib/api"
import {
  MERGE_FIELDS, unknownTokens, renderTemplate, resolveAudiences, audienceFor,
  STARTER_TEMPLATES, type StarterTemplate,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  Contract templates.

  The first version asked somebody to write an employment contract into an empty
  textarea, using tokens they had to learn first, bound by two dropdowns whose
  effect was invisible until a real person accepted an invitation. Three things
  fix that, and they are the whole of this redesign:

  1. NEVER A BLANK PAGE. You pick a starter and edit it. Almost nobody writes a
     legal document from nothing — they start from the last one and change what
     differs.

  2. A LIVE PREVIEW, filled with a REAL member's real values. Tokens are a
     detail of how this works; what an administrator needs to see is the letter
     somebody will actually receive.

  3. WHO GETS IT, COUNTED AND NAMED, while the bindings are being chosen. "Did I
     set this up right?" is the only question the two dropdowns left unanswered,
     and it is the one that matters.
*/

const SIGNATURE_MODES = [
  { key: "IN_APP", Icon: PenLine },
  { key: "ACKNOWLEDGE", Icon: CheckCheck },
  { key: "WET_INK", Icon: Printer },
  { key: "NONE", Icon: Ban },
] as const

export default function TemplatesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<ContractTemplateRow | null>(null)
  const [starter, setStarter] = useState<StarterTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery<ContractTemplateRow[]>({
    queryKey: ["document-templates"],
    queryFn: () => documentsApi.listTemplates(),
  })
  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types"],
    queryFn: () => documentsApi.listTypes(),
  })
  const { data: roles = [] } = useQuery({
    queryKey: ["org-roles"],
    queryFn: () => organizationsApi.getRoles("org"),
  })
  const { data: members = [] } = useQuery<MatchCandidateRow[]>({
    queryKey: ["document-match-candidates"],
    queryFn: () => documentsApi.matchCandidates(),
  })

  /*
    Who each template ACTUALLY reaches, resolved against all the others.

    Not who it is eligible for: the server issues one contract per person, the
    best-matching one, so an organization default is eligible for everybody
    while reaching only the people no sharper template claims. Counting
    eligibility would tell an administrator their default covers thirteen people
    on the day it covers four.
  */
  const audiences = useMemo(() => resolveAudiences(members, templates), [members, templates])

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.deactivateTemplate(id),
    onSuccess: () => {
      notify.success(t("documents.templates.retired"))
      queryClient.invalidateQueries({ queryKey: ["document-templates"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (editing || starter) {
    return (
      <TemplateEditor
        template={editing}
        starter={starter}
        templates={templates}
        types={types}
        roles={roles}
        members={members}
        onClose={() => { setEditing(null); setStarter(null) }}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {t("documents.templates.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {t("documents.templates.explainer")}
        </p>
      </header>

      {types.length === 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t("documents.templates.needTypeFirst")}
          </p>
        </div>
      )}

      {/* Existing templates */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : templates.length > 0 ? (
        <ul className="mb-8 space-y-2">
          {templates.map((tpl) => {
            const reach = audiences.get(tpl.id) ?? []
            return (
              <li
                key={tpl.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{tpl.name}</span>
                    <ModeChip mode={tpl.signatureMode} />
                    <span className="text-[11px] text-slate-400">v{tpl.version}</span>
                  </div>
                  {/*
                    Who it reaches, in a sentence, with today's number. The two
                    dropdowns said "Field Technician"; this says whether anybody
                    is actually a Field Technician.
                  */}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                    <Users className="h-3.5 w-3.5" />
                    <span>{describeAudience(tpl, roles, t)}</span>
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                      reach.length === 0
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                    )}>
                      {t("documents.templates.peopleToday", { count: reach.length })}
                    </span>
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
            )
          })}
        </ul>
      ) : null}

      {/* Starters — the alternative to an empty page */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {templates.length > 0
            ? t("documents.templates.addAnother")
            : t("documents.templates.startWith")}
        </h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          {t("documents.templates.startWithHint")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_TEMPLATES.map((st) => {
            const isBlank = st.key === "blank"
            return (
              <button
                key={st.key}
                onClick={() => setStarter(st)}
                disabled={types.length === 0}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors disabled:opacity-50",
                  isBlank
                    ? "border-dashed border-slate-300 hover:border-slate-400 dark:border-slate-700"
                    : "border-slate-200 bg-white hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900",
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  {isBlank
                    ? <Plus className="h-4 w-4 text-slate-400" />
                    : <FileSignature className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {t(`documents.templates.starters.${st.key}.name`, { defaultValue: st.name })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t(`documents.templates.starters.${st.key}.description`, { defaultValue: st.description })}
                </p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/** "Everyone" · "Field Technicians" · "Anyone in Manager who is a Driver". */
function describeAudience(
  tpl: { appliesToRole?: { name: string } | null; appliesToRoleId: string | null; appliesToPosition: string | null },
  roles: { id: string; name: string }[],
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const role = tpl.appliesToRole?.name ?? roles.find((r) => r.id === tpl.appliesToRoleId)?.name ?? null
  const pos = tpl.appliesToPosition
  if (role && pos) return t("documents.templates.audience.roleAndJob", { role, job: pos })
  if (role) return t("documents.templates.audience.role", { role })
  if (pos) return t("documents.templates.audience.job", { job: pos })
  return t("documents.templates.audience.everyone")
}

function ModeChip({ mode }: { mode: string }) {
  const { t } = useTranslation()
  const map: Record<string, { cls: string; Icon: typeof PenLine }> = {
    IN_APP: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400", Icon: PenLine },
    ACKNOWLEDGE: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", Icon: CheckCheck },
    // Amber, not red: not a fault, a legal fact about the document.
    WET_INK: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", Icon: Printer },
    NONE: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", Icon: Ban },
  }
  const v = map[mode] ?? map.NONE!
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", v.cls)}>
      <v.Icon className="h-3 w-3" />
      {t(`documents.templates.modes.${mode.toLowerCase()}`)}
    </span>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function TemplateEditor({
  template, starter, templates, types, roles, members, onClose,
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
  const queryClient = useQueryClient()

  const [name, setName] = useState(
    template?.name ??
      // The blank starter's card label ("Start from nothing") is not a name
      // anybody wants on a contract.
      (starter && starter.key !== "blank"
        ? t(`documents.templates.starters.${starter.key}.name`, { defaultValue: starter.name })
        : ""),
  )
  const [typeId, setTypeId] = useState(
    template?.typeId ??
      // A conditional, not `includes(starter?.suggestedTypeKey ?? " ")`: the
      // blank starter suggests no type, and `includes("")` matches every key.
      (starter?.suggestedTypeKey
        ? types.find((ty) => ty.key.includes(starter.suggestedTypeKey))?.id
        : undefined) ??
      types[0]?.id ??
      "",
  )
  // The wording ships in the reader's language — an Austrian admin opening
  // "Dienstvertrag" and finding English clauses would rewrite it from scratch.
  const [body, setBody] = useState(
    template?.body ??
      (starter
        ? t(`documents.templates.starters.${starter.key}.body`, { defaultValue: starter.body })
        : ""),
  )
  const [roleId, setRoleId] = useState(template?.appliesToRoleId ?? "")
  const [position, setPosition] = useState(template?.appliesToPosition ?? "")
  const [mode, setMode] = useState<string>(template?.signatureMode ?? starter?.signatureMode ?? "IN_APP")
  const [previewMode, setPreviewMode] = useState<"text" | "pdf">("text")

  const unknown = useMemo(() => unknownTokens(body), [body])
  /*
    Who this draft would reach, resolved against the templates already saved.

    Not eligibility: an existing Field Technician contract keeps its people even
    while a broader draft is open, so a new organization default correctly
    reports the handful nobody else claims rather than the whole company.

    A NEW template goes last, because that is the order the server will read it
    in and ties go to the older one. An EDIT keeps its own place.
  */
  const DRAFT = "__draft__"
  const { reach, takenBy } = useMemo(() => {
    const binding = {
      appliesToRoleId: roleId || null,
      appliesToPosition: position || null,
    }
    const draft = { id: DRAFT, ...binding }
    const set = template
      ? templates.map((t) => (t.id === template.id ? { ...t, ...draft, id: DRAFT } : t))
      : [...templates, draft]

    const resolved = resolveAudiences(members, set)
    const mine = resolved.get(DRAFT) ?? []

    /*
      "Reaches nobody" has TWO causes and they need different sentences.

      Nobody matches the binding — a job title nobody holds — is a mistake to
      fix. Everybody who matches is already covered by a sharper template is
      correct behaviour, and telling somebody "no active member matches that
      role" while thirteen of them plainly do is the sort of wrong that sends
      them hunting for a bug in their own data.
    */
    const claimed = new Set(mine)
    const takers = new Map<string, number>()
    for (const m of audienceFor(members, binding)) {
      if (claimed.has(m)) continue
      const winner = [...resolved.entries()].find(([, ms]) => ms.includes(m))?.[0]
      const label = templates.find((t) => t.id === winner)?.name
      if (label) takers.set(label, (takers.get(label) ?? 0) + 1)
    }

    return { reach: mine, takenBy: [...takers.entries()].sort((a, b) => b[1] - a[1]) }
  }, [members, templates, template, roleId, position])

  /*
    The preview, filled with a REAL member.

    Whoever this template would actually reach — not a fictional "John Doe" —
    because the thing an administrator is checking is whether the letter reads
    correctly for their own people, including the ones whose job title is blank.
  */
  const sample = reach[0] ?? members[0] ?? null

  /*
    The member's REAL values, resolved once by the server.

    This screen used to invent them — today's date where a start date belongs,
    "Your company" for the company — which made its text preview disagree with
    the PDF beside it about the same contract, and disagree with what the
    member would actually receive. Asked once per member, so the live preview
    below still re-renders on every keystroke without a round trip.
  */
  const { data: resolved } = useQuery({
    queryKey: ["template-preview-values", sample?.id ?? null],
    queryFn: () => documentsApi.previewTemplate({ memberId: sample?.id }),
    staleTime: 5 * 60 * 1000,
  })

  /*
    An em dash for every field until the real values arrive.

    The fallback used to be the raw body, so for the first moment on the screen
    the preview read "{{member.fullName}} is engaged by {{org.legalName}}" —
    which is the exact thing this pane exists to stop anybody having to read.
  */
  const preview = useMemo(() => {
    const values =
      resolved?.values ?? Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, "—"]))
    return renderTemplate(body, values).text
  }, [body, resolved])

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
                <Select value={typeId} onChange={setTypeId}
                  options={types.map((ty) => ({ value: ty.id, label: ty.label }))} />
              </Field>
            </div>
          </Step>

          <Step n={2} title={t("documents.templates.step2")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("documents.templates.role")}>
                <Select value={roleId} onChange={setRoleId}
                  options={[{ value: "", label: t("documents.templates.anyRole") },
                            ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
              </Field>
              <Field label={t("documents.templates.jobTitle")}>
                <Input value={position} onChange={(e) => setPosition(e.target.value)}
                  placeholder={t("documents.templates.anyJobTitle")} />
              </Field>
            </div>

            {/* The answer to "did I set this up right?" */}
            <div className={cn(
              "mt-3 flex items-start gap-2.5 rounded-lg border p-3",
              reach.length === 0
                ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50",
            )}>
              <Users className={cn("mt-0.5 h-4 w-4 shrink-0",
                reach.length === 0 ? "text-amber-600" : "text-slate-400")} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {reach.length === 0
                    ? t("documents.templates.reachesNobody")
                    : t("documents.templates.reaches", { count: reach.length })}
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  {reach.length > 0
                    ? reach.slice(0, 8).map((m) => m.firstName).join(", ") +
                      (reach.length > 8 ? ` +${reach.length - 8}` : "")
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
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0",
                    mode === key ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
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
              className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400"
                >
                  {t(`documents.templates.fieldLabels.${f.token}`, { defaultValue: f.label })}
                </button>
              ))}
            </div>

            {unknown.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-slate-700 dark:text-slate-300">
                  {t("documents.templates.unknownFields")}{" "}
                  <span className="font-mono">{unknown.join(", ")}</span>
                </p>
              </div>
            )}
          </Step>

          <div className="flex justify-end gap-2 pb-4">
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </div>

        {/* ── Right: what the member will actually receive ───────────────── */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("documents.templates.preview")}
              </h2>
            </div>

            {/*
              Text or PDF, and both are worth having.

              Text is instant and reads while you type. The PDF is the actual
              artefact — the real font, the real margins, the real page breaks —
              rendered by the SAME code that issues contracts, so a clause
              orphaned at the foot of page two is visible here rather than in
              somebody's personnel file.
            */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
              {(["text", "pdf"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPreviewMode(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    previewMode === m
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
                  )}
                >
                  {t(`documents.templates.preview_${m}`)}
                </button>
              ))}
            </div>
          </div>

          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {sample
              ? t("documents.templates.previewFor", { name: `${sample.firstName} ${sample.lastName}` })
              : t("documents.templates.previewNoOne")}
          </p>

          {previewMode === "pdf" ? (
            <PdfPreview
              body={body}
              title={types.find((ty) => ty.id === typeId)?.label || name}
              memberId={sample?.id}
            />
          ) : (
            /* A page, not a code block: the point is that it reads like the
               letter somebody receives, with the tokens already gone. */
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {body.trim() ? (
                <>
                  <p className="mb-4 border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
                    {types.find((ty) => ty.id === typeId)?.label || name || t("documents.templates.untitled")}
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {preview}
                  </pre>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">
                  {t("documents.templates.previewEmpty")}
                </p>
              )}
            </div>
          )}

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {t("documents.templates.notAdvice")}
          </p>
        </aside>
      </div>
    </div>
  )
}

/**
 * The draft, rendered by the server into the PDF a member would receive.
 *
 * Rendered SERVER-side on purpose. A second renderer in the browser would draw
 * a document nobody is ever sent — different font metrics, different page
 * breaks — and the one question this pane exists to answer is what the real
 * file looks like.
 *
 * Debounced rather than live: a render is real work at both ends, and a
 * contract is read in pauses, not per keystroke.
 */
function PdfPreview({
  body,
  title,
  memberId,
}: {
  body: string
  title: string
  memberId?: string
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!body.trim()) {
      setUrl(null)
      setError(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await documentsApi.previewTemplate({ body, title, memberId })
        if (cancelled || !res?.pdf) return

        // base64 → bytes → blob. The PDF is never stored, so there is no URL to
        // presign and nothing to clean up server-side.
        const binary = atob(res.pdf)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))

        setUrl((old) => {
          // Revoke the one being replaced, or every edit leaks a few kilobytes
          // for as long as the tab stays open.
          if (old) URL.revokeObjectURL(old)
          return objectUrl
        })
        setMissing(res.missing)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("documents.templates.previewFailed"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [body, title, memberId, t])

  // The last render is revoked when the pane goes away, not before — switching
  // back to Text and returning should not have to re-render.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (!body.trim()) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="py-10 text-center text-sm text-slate-400">
          {t("documents.templates.previewEmpty")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">{error}</p>
        </div>
      ) : (
        <div className="relative">
          {url && (
            <iframe
              /* Chrome's viewer opens with the thumbnail rail out, which eats
                 half of a pane that is already narrow. */
              src={`${url}#view=FitH&navpanes=0`}
              title={t("documents.templates.preview")}
              className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
            />
          )}
          {(loading || !url) && (
            <div className={cn(
              "flex items-center justify-center gap-2 rounded-lg text-sm text-slate-400",
              url ? "absolute inset-0 bg-white/60 dark:bg-slate-950/60" : "h-[70vh] border border-slate-200 dark:border-slate-800",
            )}>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("documents.templates.previewRendering")}
            </div>
          )}
        </div>
      )}

      {/*
        Values the member's record does not have. They print as an em dash here
        and would REFUSE to issue — better named now than discovered on the day
        somebody is waiting for their contract.
      */}
      {missing.length > 0 && !error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t("documents.templates.previewMissing", {
              count: missing.length,
              fields: missing
                .map((f) => t(`documents.templates.fieldLabels.${f}`, { defaultValue: f }))
                .join(", "),
            })}
          </p>
        </div>
      )}

      {url && !error && (
        <a
          href={url}
          download={`${title || t("documents.templates.untitled")}.pdf`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <Download className="h-4 w-4" />
          {t("documents.templates.previewDownload")}
        </a>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="pl-[34px]">{children}</div>
    </section>
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
