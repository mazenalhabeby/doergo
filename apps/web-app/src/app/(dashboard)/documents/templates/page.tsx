"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { FileSignature, Plus, AlertTriangle, PenSquare, Trash2, ArrowLeft, Users } from "lucide-react"
import { documentsApi, type ContractTemplateRow, type DocumentTypeRow, type MatchCandidateRow } from "@/lib/api"
import { resolveAudiences, STARTER_TEMPLATES, type StarterTemplate } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { describeAudience } from "./_lib/template-options"
import { ModeChip } from "./_components/mode-chip"
import { TemplateEditor } from "./_components/template-editor"
import { useOrgRoles } from "@/hooks/use-org-roles"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Chip, Notice, PageHeader, Panel } from "@/components/page/page-kit"

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
  const { data: roles = [] } = useOrgRoles("org", { enabled: holds("org:canManageUsers") })
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
        onClose={() => {
          setEditing(null)
          setStarter(null)
        }}
      />
    )
  }

  return (
    <div className={PAGE_SHELL}>
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <PageHeader title={t("documents.templates.title")} subtitle={t("documents.templates.explainer")} />

      {types.length === 0 && (
        <Notice tone="warn">
          <AlertTriangle />
          <p className="text-sm text-foreground">{t("documents.templates.needTypeFirst")}</p>
        </Notice>
      )}

      {/* Existing templates */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      ) : templates.length > 0 ? (
        <Panel as="div" className="mb-3.5 p-1.5">
          <ul>
            {templates.map((tpl) => {
              const reach = audiences.get(tpl.id) ?? []
              return (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-[13px] first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-foreground">{tpl.name}</span>
                      <ModeChip mode={tpl.signatureMode} />
                      <span className="text-[11px] text-muted-foreground">v{tpl.version}</span>
                    </div>
                    {/*
                    Who it reaches, in a sentence, with today's number. The two
                    dropdowns said "Field Technician"; this says whether anybody
                    is actually a Field Technician.
                  */}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{describeAudience(tpl, roles, t)}</span>
                      <Chip tone={reach.length === 0 ? "warn" : "soft"}>
                        {t("documents.templates.peopleToday", { count: reach.length })}
                      </Chip>
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="pill"
                      variant="outline"
                      className="h-8 px-3 text-[13px]"
                      onClick={() => setEditing(tpl)}
                    >
                      <PenSquare />
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="pillIcon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => remove.mutate(tpl.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      ) : null}

      {/* Starters — the alternative to an empty page */}
      <Panel className="px-5 py-[18px]">
        <h2 className="mb-0.5 text-[15px] font-semibold text-foreground">
          {templates.length > 0 ? t("documents.templates.addAnother") : t("documents.templates.startWith")}
        </h2>
        <p className="mb-3 text-[12.5px] text-muted-foreground">{t("documents.templates.startWithHint")}</p>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {STARTER_TEMPLATES.map((st) => {
            const isBlank = st.key === "blank"
            return (
              <button
                key={st.key}
                onClick={() => setStarter(st)}
                disabled={types.length === 0}
                className={cn(
                  "rounded-2xl border border-dashed border-border p-4 text-left transition-colors hover:bg-accent",
                  "disabled:opacity-50",
                  !isBlank && "bg-muted/50",
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  {isBlank ? (
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileSignature className="h-4 w-4 text-shell-accent" />
                  )}
                  <span className="font-semibold text-foreground">
                    {t(`documents.templates.starters.${st.key}.name`, { defaultValue: st.name })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`documents.templates.starters.${st.key}.description`, { defaultValue: st.description })}
                </p>
              </button>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
