"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Plus, ArrowLeft, ShieldCheck, RotateCcw } from "lucide-react"
import {
  documentsApi, workflowsApi, organizationsApi,
  type DocumentTypeRow,
} from "@/lib/api"
import { STARTER_DOCUMENT_TYPES, type StarterDocumentType } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { BLANK } from "./_lib/type-options"
import { DirectionIcon } from "./_components/direction-icon"
import { TypeRow } from "./_components/type-row"
import { TypeEditor } from "./_components/type-editor"

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
  const { data: workflows = [] } = useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
    enabled: holds("org:canViewAllTasks"),
  })

  // Member roles, for "who do we require this from" — the same list the
  // contract templates bind against.
  const { data: roles = [] } = useQuery({
    queryKey: keys.organization.roles(),
    queryFn: () => organizationsApi.getRoles("org"),
    enabled: holds("org:canManageUsers"),
  })

  const active = useMemo(() => types.filter((ty) => ty.isActive), [types])
  const retired = useMemo(() => types.filter((ty) => !ty.isActive), [types])

  // A starter already in use is not an option — it would fail on the unique key
  // and read as a bug rather than as "you already have one".
  const taken = useMemo(() => new Set(types.map((ty) => ty.key)), [types])

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive
        ? documentsApi.updateType(id, { isActive: true })
        : documentsApi.deactivateType(id),
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
          {t("documents.types.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {t("documents.types.explainer")}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="mb-8 space-y-2">
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
          )}

          {/* Starters — the alternative to an empty form */}
          <section>
            <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {active.length > 0 ? t("documents.types.addAnother") : t("documents.types.startWith")}
            </h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {t("documents.types.startWithHint")}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STARTER_DOCUMENT_TYPES.filter((st) => !taken.has(st.key)).map((st) => (
                <button
                  key={st.key}
                  onClick={() => setStarter(st)}
                  className={"rounded-xl border border-slate-200 bg-white p-4 text-left " +
                    "transition-colors hover:border-blue-400 dark:border-slate-800 " +
                    "dark:bg-slate-900"}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <DirectionIcon direction={st.direction} />
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {t(`documents.types.starters.${st.key}.label`, { defaultValue: st.label })}
                    </span>
                    {st.isCredential && (
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {t(`documents.types.starters.${st.key}.description`, { defaultValue: st.description })}
                  </p>
                </button>
              ))}

              <button
                onClick={() => setStarter(BLANK)}
                className={"rounded-xl border border-dashed border-slate-300 p-4 text-left " +
                  "transition-colors hover:border-slate-400 dark:border-slate-700"}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {t("documents.types.blank")}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {t("documents.types.blankHint")}
                </p>
              </button>
            </div>
          </section>

          {retired.length > 0 && (
            <section className="mt-8">
              <button
                onClick={() => setShowRetired((v) => !v)}
                className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {t("documents.types.retiredCount", { count: retired.length })}
              </button>
              {showRetired && (
                <ul className="mt-3 space-y-2">
                  {retired.map((ty) => (
                    <li
                      key={ty.id}
                      className={"flex flex-wrap items-center gap-3 rounded-xl border border-dashed " +
                        "border-slate-200 p-4 dark:border-slate-800"}
                    >
                      <span className="flex-1 text-slate-500 line-through dark:text-slate-400">{ty.label}</span>
                      <Button size="sm" variant="ghost"
                        onClick={() => setActive.mutate({ id: ty.id, isActive: true })}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t("documents.types.restore")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 max-w-2xl text-xs text-slate-400">
                {t("documents.types.retiredHint")}
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
