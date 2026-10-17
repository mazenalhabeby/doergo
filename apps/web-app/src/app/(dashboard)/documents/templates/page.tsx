"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { FileSignature, Plus, AlertTriangle, PenSquare, Trash2, ArrowLeft, Users } from "lucide-react"
import {
  documentsApi, organizationsApi,
  type ContractTemplateRow, type DocumentTypeRow, type MatchCandidateRow,
} from "@/lib/api"
import { resolveAudiences, STARTER_TEMPLATES, type StarterTemplate } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { describeAudience } from "./_lib/template-options"
import { ModeChip } from "./_components/mode-chip"
import { TemplateEditor } from "./_components/template-editor"

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

export default function TemplatesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<ContractTemplateRow | null>(null)
  const [starter, setStarter] = useState<StarterTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery<ContractTemplateRow[]>({
    queryKey: keys.documents.templates(),
    queryFn: () => documentsApi.listTemplates(),
  })
  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: keys.documents.types(),
    queryFn: () => documentsApi.listTypes(),
  })
  // GET /organizations/roles is canManageUsers — asked only of whoever holds it.
  const { holds } = useRouteAccess()
  const { data: roles = [] } = useQuery({
    queryKey: keys.organization.roles(),
    queryFn: () => organizationsApi.getRoles("org"),
    enabled: holds("org:canManageUsers"),
  })
  const { data: members = [] } = useQuery<MatchCandidateRow[]>({
    queryKey: keys.documents.matchCandidates(),
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
      queryClient.invalidateQueries({ queryKey: keys.documents.templates() })
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
        <div
          className={"mb-5 flex items-start gap-3 rounded-lg border border-amber-200 " +
            "bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"}>
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
                className={"flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 " +
                  "bg-white p-4 dark:border-slate-800 dark:bg-slate-900"}
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
