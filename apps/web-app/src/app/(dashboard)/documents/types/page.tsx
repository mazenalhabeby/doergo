"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  FileText, Plus, ArrowLeft, PenSquare, Archive, ShieldCheck, Upload, Building2,
  CalendarClock, PenLine, CheckCheck, Printer, Ban, AlertTriangle, RotateCcw, Loader2,
} from "lucide-react"
import {
  documentsApi, workflowsApi,
  type DocumentTypeRow,
} from "@/lib/api"
import {
  STARTER_DOCUMENT_TYPES, documentTypeKey, typeConsequences,
  type StarterDocumentType,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

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

const CADENCES = ["ONE_OFF", "MONTHLY", "ANNUAL"] as const
const DIRECTIONS = ["ISSUED", "SUPPLIED"] as const
const SIGN_MODES = [
  { key: "NONE", Icon: Ban },
  { key: "ACKNOWLEDGE", Icon: CheckCheck },
  { key: "IN_APP", Icon: PenLine },
  { key: "WET_INK", Icon: Printer },
] as const

/** Retention offered in years, because nobody thinks in months. */
const RETENTION_YEARS = [3, 5, 7, 10, 30] as const

export default function DocumentTypesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<DocumentTypeRow | null>(null)
  const [starter, setStarter] = useState<StarterDocumentType | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const { data: types = [], isLoading } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types", "all"],
    queryFn: () => documentsApi.listTypes(true),
  })

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
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
      queryClient.invalidateQueries({ queryKey: ["document-types"] })
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
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    {st.direction === "SUPPLIED"
                      ? <Upload className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      : <Building2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
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
                className="rounded-xl border border-dashed border-slate-300 p-4 text-left transition-colors hover:border-slate-400 dark:border-slate-700"
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
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 dark:border-slate-800"
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

/** The empty starter. Not in the shared list — it is a UI affordance, not a type. */
const BLANK: StarterDocumentType = {
  key: "",
  label: "",
  description: "",
  cadence: "ONE_OFF",
  direction: "ISSUED",
  signatureMode: "NONE",
  isCredential: false,
  hasExpiry: false,
  retentionMonths: null,
}

function TypeRow({
  type, workflows, onEdit, onRetire,
}: {
  type: DocumentTypeRow
  workflows: { id: string; name: string }[]
  onEdit: () => void
  onRetire: () => void
}) {
  const { t } = useTranslation()
  const gated = workflows.filter((w) => type.requiredForWorkflowIds.includes(w.id))

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {type.direction === "SUPPLIED"
            ? <Upload className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <Building2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
          <span className="font-medium text-slate-900 dark:text-slate-100">{type.label}</span>
          {type.isCredential && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <ShieldCheck className="h-3 w-3" />
              {t("documents.types.credential")}
            </span>
          )}
          <code className="text-[11px] text-slate-400">{type.key}</code>
        </div>

        {/* Consequences, not flags. */}
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {typeConsequences(type)
            .map((c) => t(`documents.types.consequences.${c}`))
            .join(" · ")}
          {gated.length > 0 && ` · ${gated.map((w) => w.name).join(", ")}`}
        </p>
      </div>

      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={t("common.edit")}>
          <PenSquare className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onRetire} aria-label={t("documents.types.retire")}>
          <Archive className="h-4 w-4 text-slate-400" />
        </Button>
      </div>
    </li>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function TypeEditor({
  type, starter, existingKeys, workflows, onClose,
}: {
  type: DocumentTypeRow | null
  starter: StarterDocumentType | null
  existingKeys: Set<string>
  workflows: { id: string; name: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isNew = !type

  const [label, setLabel] = useState(
    type?.label ??
      (starter?.key
        ? t(`documents.types.starters.${starter.key}.label`, { defaultValue: starter.label })
        : ""),
  )
  const [description, setDescription] = useState(
    type?.description ??
      (starter?.key
        ? t(`documents.types.starters.${starter.key}.description`, { defaultValue: starter.description })
        : ""),
  )
  const [direction, setDirection] = useState(type?.direction ?? starter?.direction ?? "ISSUED")
  const [cadence, setCadence] = useState(type?.cadence ?? starter?.cadence ?? "ONE_OFF")
  const [signatureMode, setSignatureMode] = useState(type?.signatureMode ?? starter?.signatureMode ?? "NONE")
  const [isCredential, setIsCredential] = useState(type?.isCredential ?? starter?.isCredential ?? false)
  const [hasExpiry, setHasExpiry] = useState(type?.hasExpiry ?? starter?.hasExpiry ?? false)
  const [gates, setGates] = useState<string[]>(type?.requiredForWorkflowIds ?? [])
  const [retentionMonths, setRetentionMonths] = useState<number | null>(
    type?.retentionMonths ?? starter?.retentionMonths ?? null,
  )

  // The key follows the label until the type exists; after that it is frozen,
  // because it is what every document already filed is identified through.
  const key = isNew ? documentTypeKey(starter?.key || label) : type!.key
  const keyTaken = isNew && !!key && existingKeys.has(key)

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return documentsApi.createType({
          key, label, description,
          cadence, direction, signatureMode,
          isCredential, hasExpiry,
          requiredForWorkflowIds: isCredential ? gates : [],
          retentionMonths,
        })
      }
      /*
        `cadence` and `direction` are NOT sent on an edit.

        The server refuses them, and for a good reason: changing either
        re-interprets every document already filed under the type. A MONTHLY
        type turned ONE_OFF orphans twelve rows a year from their period, and
        flipping direction would hand members a delete button for payslips.
      */
      return documentsApi.updateType(type!.id, {
        label, description, signatureMode,
        isCredential, hasExpiry,
        requiredForWorkflowIds: isCredential ? gates : [],
        retentionMonths,
      })
    },
    onSuccess: () => {
      notify.success(t(isNew ? "documents.types.created" : "documents.types.saved"))
      queryClient.invalidateQueries({ queryKey: ["document-types"] })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const canSave = !!label.trim() && !!key && !keyTaken && !save.isPending

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={onClose}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.types.title")}
      </button>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {isNew ? t("documents.types.new") : t("documents.types.edit")}
      </h1>

      <div className="space-y-6">
        <Step n={1} title={t("documents.types.step1")}>
          <div className="space-y-3">
            <Field label={t("documents.types.label")}>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label={t("documents.types.description")} hint={t("documents.types.descriptionHint")}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {key && (
              <p className={cn("text-xs", keyTaken ? "text-red-600" : "text-slate-400")}>
                {keyTaken
                  ? t("documents.types.keyTaken", { key })
                  : t("documents.types.keyIs", { key })}
              </p>
            )}
          </div>
        </Step>

        <Step n={2} title={t("documents.types.step2")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIRECTIONS.map((d) => (
              <Choice
                key={d}
                selected={direction === d}
                disabled={!isNew}
                onClick={() => setDirection(d)}
                Icon={d === "SUPPLIED" ? Upload : Building2}
                title={t(`documents.types.direction.${d.toLowerCase()}`)}
                hint={t(`documents.types.directionHint.${d.toLowerCase()}`)}
              />
            ))}
          </div>
          {!isNew && <Locked>{t("documents.types.directionLocked")}</Locked>}
        </Step>

        <Step n={3} title={t("documents.types.step3")}>
          <div className="grid gap-2 sm:grid-cols-3">
            {CADENCES.map((c) => (
              <Choice
                key={c}
                selected={cadence === c}
                disabled={!isNew}
                onClick={() => setCadence(c)}
                Icon={CalendarClock}
                title={t(`documents.types.cadence.${c.toLowerCase()}`)}
                hint={t(`documents.types.cadenceHint.${c.toLowerCase()}`)}
              />
            ))}
          </div>
          {!isNew && <Locked>{t("documents.types.cadenceLocked")}</Locked>}
        </Step>

        <Step n={4} title={t("documents.types.step4")}>
          <Toggle
            checked={isCredential}
            onChange={(v) => {
              setIsCredential(v)
              // A certificate that does not expire is legitimate, but the
              // common case by far is one that does.
              if (v && !hasExpiry) setHasExpiry(true)
              if (!v) setGates([])
            }}
            title={t("documents.types.isCredential")}
            hint={t("documents.types.isCredentialHint")}
          />

          {isCredential && (
            <div className="mt-3 space-y-3 border-l-2 border-amber-300 pl-4 dark:border-amber-800">
              <Toggle
                checked={hasExpiry}
                onChange={setHasExpiry}
                title={t("documents.types.hasExpiry")}
                hint={t("documents.types.hasExpiryHint")}
              />

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("documents.types.gates")}
                </p>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  {t("documents.types.gatesHint")}
                </p>
                {workflows.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("documents.types.noTaskTypes")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {workflows.map((w) => {
                      const on = gates.includes(w.id)
                      return (
                        <button
                          key={w.id}
                          onClick={() => setGates((g) =>
                            on ? g.filter((x) => x !== w.id) : [...g, w.id],
                          )}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            on
                              ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                          )}
                        >
                          {w.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                {gates.length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("documents.types.gatesWarning", { count: gates.length })}
                  </p>
                )}
              </div>
            </div>
          )}
        </Step>

        {direction === "ISSUED" && (
          <Step n={5} title={t("documents.types.step5")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {SIGN_MODES.map(({ key: k, Icon }) => (
                <Choice
                  key={k}
                  selected={signatureMode === k}
                  onClick={() => setSignatureMode(k)}
                  Icon={Icon}
                  title={t(`documents.templates.modes.${k.toLowerCase()}`)}
                  hint={t(`documents.templates.modeHints.${k.toLowerCase()}`)}
                />
              ))}
            </div>
          </Step>
        )}

        <Step n={direction === "ISSUED" ? 6 : 5} title={t("documents.types.step6")}>
          <div className="flex flex-wrap gap-1.5">
            {RETENTION_YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setRetentionMonths(y * 12)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  retentionMonths === y * 12
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                )}
              >
                {t("documents.types.years", { count: y })}
              </button>
            ))}
            <button
              onClick={() => setRetentionMonths(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                retentionMonths === null
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
              )}
            >
              {t("documents.types.forever")}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {t("documents.types.retentionNote")}
          </p>
        </Step>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  )
}

// ── Small pieces ───────────────────────────────────────────────────────────

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
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

function Choice({
  selected, disabled, onClick, Icon, title, hint,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  Icon: typeof Upload
  title: string
  hint: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800",
      )}
    >
      <div className="mb-0.5 flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
    </button>
  )
}

function Toggle({
  checked, onChange, title, hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 dark:border-slate-800"
    >
      <span
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700",
        )}
      >
        <span className={cn(
          "block h-4 w-4 rounded-full bg-white transition-transform",
          checked && "translate-x-4",
        )} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  )
}

function Locked({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  )
}
