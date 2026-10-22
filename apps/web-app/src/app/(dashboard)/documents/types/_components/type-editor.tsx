"use client"

import { useTranslation } from "react-i18next"
import { ArrowLeft, CalendarClock, Loader2 } from "lucide-react"
import { type DocumentTypeRow } from "@/lib/api"
import { type StarterDocumentType } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CADENCES, SIGN_MODES, RETENTION_YEARS } from "../_lib/type-options"
import { useTypeEditor } from "../_hooks/use-type-editor"
import { Step, Field, Choice, Locked } from "./type-editor-controls"
import { RouteEditor } from "./route-editor"
import { TypeDirectionStep } from "./type-direction-step"
import { TypeCredentialStep } from "./type-credential-step"
import { TypeRequiredStep } from "./type-required-step"

export function TypeEditor({
  type,
  starter,
  existingKeys,
  workflows,
  roles,
  onClose,
}: {
  type: DocumentTypeRow | null
  starter: StarterDocumentType | null
  existingKeys: Set<string>
  workflows: { id: string; name: string }[]
  roles: { id: string; name: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const form = useTypeEditor({ type, starter, existingKeys, onClose })
  const {
    isNew,
    key,
    keyTaken,
    save,
    canSave,
    label,
    setLabel,
    description,
    setDescription,
    direction,
    setDirection,
    cadence,
    setCadence,
    signatureMode,
    setSignatureMode,
    isCredential,
    setIsCredential,
    hasExpiry,
    setHasExpiry,
    gates,
    setGates,
    requiredFromAll,
    setRequiredFromAll,
    requiredFromRoleIds,
    setRequiredFromRoleIds,
    visibleToRoleIds,
    setVisibleToRoleIds,
    twoSided,
    setTwoSided,
    multiPage,
    setMultiPage,
    scanShape,
    setScanShape,
    route,
    setRoute,
    retentionMonths,
    setRetentionMonths,
  } = form

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
                {keyTaken ? t("documents.types.keyTaken", { key }) : t("documents.types.keyIs", { key })}
              </p>
            )}
          </div>
        </Step>

        <TypeDirectionStep
          direction={direction}
          isNew={isNew}
          setDirection={setDirection}
          scanShape={scanShape}
          setScanShape={setScanShape}
          twoSided={twoSided}
          setTwoSided={setTwoSided}
          setMultiPage={setMultiPage}
          multiPage={multiPage}
        />

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

        <TypeCredentialStep
          isCredential={isCredential}
          setIsCredential={setIsCredential}
          hasExpiry={hasExpiry}
          setHasExpiry={setHasExpiry}
          gates={gates}
          setGates={setGates}
          workflows={workflows}
        />

        {/*
          Only for what the member provides. "Do we require this from people?"
          is unanswerable about a payslip — the company issues those, and asking
          an employee to produce one is not a requirement, it is a category
          error. The server refuses it too.
        */}
        <TypeRequiredStep
          direction={direction}
          requiredFromAll={requiredFromAll}
          requiredFromRoleIds={requiredFromRoleIds}
          setRequiredFromAll={setRequiredFromAll}
          setRequiredFromRoleIds={setRequiredFromRoleIds}
          roles={roles}
        />

        {/*
          Who may see it.

          Deliberately the same control as "Required from" one step above: a
          reader who has used that one already knows this one, and the two
          questions are mirrors — who must provide this, and who may look at it.
        */}
        <Step n={6} title={t("documents.types.stepVisibility")}>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setVisibleToRoleIds([])}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                visibleToRoleIds.length === 0
                  ? "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
              )}
            >
              {t("documents.types.visibleEveryone")}
            </button>
            {roles.map((r) => {
              const on = visibleToRoleIds.includes(r.id)
              return (
                <button
                  key={r.id}
                  onClick={() =>
                    setVisibleToRoleIds((ids) => (ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id]))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                  )}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {visibleToRoleIds.length === 0
              ? t("documents.types.visibleEveryoneNote")
              : t("documents.types.visibleNote")}
          </p>
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

            {/*
              The signing route.

              Only offered once the type takes a signature at all: a route on a
              type nobody signs is a list of people who will never be asked.
            */}
            {signatureMode !== "NONE" && (
              <div className="mt-5 border-t border-border/60 pt-5">
                <p className="text-sm font-medium text-foreground">
                  {t("documents.types.route.title", "Who signs it")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "documents.types.route.hint",
                    "Leave empty and the member signs it alone. Add steps and the document " +
                      "travels — each person signs in turn, and all their signatures end up on " +
                      "it.",
                  )}
                </p>
                <RouteEditor route={route} onChange={setRoute} />
              </div>
            )}
          </Step>
        )}

        <Step n={6} title={t("documents.types.step6")}>
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
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{t("documents.types.retentionNote")}</p>
        </Step>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  )
}
