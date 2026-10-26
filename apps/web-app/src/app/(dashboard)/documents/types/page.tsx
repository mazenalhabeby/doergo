"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Plus, ArrowLeft, ShieldCheck, RotateCcw } from "lucide-react"
import { documentsApi, type DocumentTypeRow } from "@/lib/api"
import { STARTER_DOCUMENT_TYPES, type StarterDocumentType } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader, Panel } from "@/components/page/page-kit"
import { notify } from "@/lib/toast"
import { BLANK } from "./_lib/type-options"
import { DirectionIcon } from "./_components/direction-icon"
import { TypeRow } from "./_components/type-row"
import { TypeEditor } from "./_components/type-editor"
import { useOrgRoles } from "@/hooks/use-org-roles"
import { useWorkflows } from "@/hooks/use-workflows"

/*
  Document types — the configuration everything else in the personnel file
  depends on.

  There was no screen for this at all: `isCredential`, `hasExpiry` and
  `requiredForWorkflowIds` decide who can upload what and who drops out of the
  dispatch pool, and the only way to set them was a POST by hand. So a customer
  could see a compliance board and never be able to put anything on it.

  Two things this screen refuses to be:

  1. AN EMPTY FORM. Eleven starters, each a real thing a field-service company
     files, so the first click produces a working type rather than a decision
     about the word "cadence".

  2. A LIST OF FLAGS. Every switch here changes something a person will notice —
     whether the member can upload it, whether a lapse stops dispatch, whether
     anybody has to sign. The form states the consequence, not the field name.
*/

export default function DocumentTypesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<DocumentTypeRow | null>(null)
  const [starter, setStarter] = useState<StarterDocumentType | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const { data: types = [], isLoading } = useQuery<DocumentTypeRow[]>({
    queryKey: keys.documents.allTypes(),
    queryFn: () => documentsApi.listTypes(true),
  })

  // Both lists are other permissions' (GET /workflows: canViewAllTasks, GET /organizations/roles:
  // canManageUsers) — asked only of whoever holds them, so the editor never fires a 403.
  const { holds } = useRouteAccess()
  const { data: workflows = [] } = useWorkflows({ enabled: holds("org:canViewAllTasks") })

  // Member roles, for "who do we require this from" — the same list the
  // contract templates bind against.
  const { data: roles = [] } = useOrgRoles("org", { enabled: holds("org:canManageUsers") })

  const active = useMemo(() => types.filter((ty) => ty.isActive), [types])
  const retired = useMemo(() => types.filter((ty) => !ty.isActive), [types])

  // A starter already in use is not an option — it would fail on the unique key
  // and read as a bug rather than as "you already have one".
  const taken = useMemo(() => new Set(types.map((ty) => ty.key)), [types])

  const setActive = useMutation({
    // The answer is not read (either call's), only success or failure.
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }): Promise<unknown> =>
      isActive ? documentsApi.updateType(id, { isActive: true }) : documentsApi.deactivateType(id),
    onSuccess: (_r, v) => {
      notify.success(t(v.isActive ? "documents.types.restored" : "documents.types.retired"))
      queryClient.invalidateQueries({ queryKey: keys.documents.types() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (editing || starter) {
    return (
      <TypeEditor
        type={editing}
        starter={starter}
        existingKeys={taken}
        workflows={workflows}
        roles={roles}
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

      <PageHeader title={t("documents.types.title")} subtitle={t("documents.types.explainer")} />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <Panel as="div" className="mb-3.5 p-1.5">
              <ul>
                {active.map((ty) => (
                  <TypeRow
                    key={ty.id}
                    type={ty}
                    workflows={workflows}
                    roles={roles}
                    onEdit={() => setEditing(ty)}
                    onRetire={() => setActive.mutate({ id: ty.id, isActive: false })}
                  />
                ))}
              </ul>
            </Panel>
          )}

          {/* Starters — the alternative to an empty form */}
          <Panel className="px-5 py-[18px]">
            <h2 className="mb-0.5 text-[15px] font-semibold text-foreground">
              {active.length > 0 ? t("documents.types.addAnother") : t("documents.types.startWith")}
            </h2>
            <p className="mb-3 text-[12.5px] text-muted-foreground">{t("documents.types.startWithHint")}</p>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {STARTER_DOCUMENT_TYPES.filter((st) => !taken.has(st.key)).map((st) => (
                <button
                  key={st.key}
                  onClick={() => setStarter(st)}
                  className={
                    "rounded-2xl border border-dashed border-border bg-muted/50 p-4 text-left " +
                    "transition-colors hover:bg-accent"
                  }
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <DirectionIcon direction={st.direction} />
                    <span className="font-semibold text-foreground">
                      {t(`documents.types.starters.${st.key}.label`, { defaultValue: st.label })}
                    </span>
                    {st.isCredential && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-shell-warn" />}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`documents.types.starters.${st.key}.description`, { defaultValue: st.description })}
                  </p>
                </button>
              ))}

              <button
                onClick={() => setStarter(BLANK)}
                className={
                  "rounded-2xl border border-dashed border-border p-4 text-left " + "transition-colors hover:bg-accent"
                }
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">{t("documents.types.blank")}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{t("documents.types.blankHint")}</p>
              </button>
            </div>
          </Panel>

          {retired.length > 0 && (
            <section className="mt-8">
              <button
                onClick={() => setShowRetired((v) => !v)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("documents.types.retiredCount", { count: retired.length })}
              </button>
              {showRetired && (
                <ul className="mt-3 space-y-2">
                  {retired.map((ty) => (
                    <li
                      key={ty.id}
                      className="flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed border-border px-4 py-3"
                    >
                      <span className="flex-1 text-muted-foreground line-through">{ty.label}</span>
                      <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: ty.id, isActive: true })}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t("documents.types.restore")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{t("documents.types.retiredHint")}</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
