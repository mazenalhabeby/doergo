"use client"

import { useTranslation } from "react-i18next"
import { CLIENT_COPY_OPTIONS, type ClientCopyOption, type TaskReportCopy, type TaskReportIssuerOption } from "@hbcfield/shared/client"

import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { CompanyOptionSelect } from "@/components/companies/company-select"
import { cn } from "@/lib/utils"
import type { HeadToggle, HeadToggleGroup, ReportToggle } from "../_lib/report-model"

/** "Office copy / Client copy" — which copy the server is asked for. */
export function CopySwitch({ copy, onChange }: { copy: TaskReportCopy; onChange: (c: TaskReportCopy) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t("tasks.report.copy.label")} className="inline-grid grid-flow-col gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
      {(["office", "client"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={copy === c}
          onClick={() => onChange(c)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            copy === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`tasks.report.copy.${c}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * "Issued by" — the company on the letterhead, chosen per report like an invoice's.
 * Renders NOTHING while the organization has one company (the invoice pickers' rule).
 * The choices come with the report (`meta.issuers`), so no permission to list
 * companies is needed; the server refuses anything not in that list.
 */
export function IssuerPicker({
  issuers,
  value,
  defaultId,
  onChange,
}: {
  issuers: readonly TaskReportIssuerOption[]
  /** The chosen company; null = the automatic rule. */
  value: string | null
  /** What the automatic rule picks (workspace → client → main). */
  defaultId: string | null
  onChange: (id: string | null) => void
}) {
  const { t } = useTranslation()
  if (issuers.length <= 1) return null
  const auto = issuers.find((i) => i.id === defaultId)?.name
  return (
    <div className="space-y-1.5">
      <Label htmlFor="report-issuer" className="text-sm font-semibold text-foreground">{t("tasks.report.issuer.label")}</Label>
      <CompanyOptionSelect
        id="report-issuer"
        className="h-9 w-full"
        companies={issuers}
        value={value}
        onChange={onChange}
        inheritLabel={auto ? t("companies.sameAsDefault", { name: auto }) : t("tasks.report.issuer.automatic")}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">{t("tasks.report.issuer.hint")}</p>
    </div>
  )
}

/**
 * "Top of the report": the letterhead lines, the labels under the title and the
 * detail boxes — a switch each, only for what this report has. Display only.
 */
export function HeadSwitches({
  available,
  off,
  onToggle,
}: {
  available: Record<HeadToggleGroup, readonly HeadToggle[]>
  off: ReadonlySet<HeadToggle>
  onToggle: (tg: HeadToggle, on: boolean) => void
}) {
  const { t } = useTranslation()
  const groups = (["letterhead", "labels", "facts"] as const).filter((g) => available[g].length)
  if (!groups.length) return null
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{t("tasks.report.head.title")}</h2>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("tasks.report.head.hint")}</p>
      {groups.map((g) => (
        <div key={g} className="mt-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t(`tasks.report.head.groups.${g}`)}</h3>
          <ul className="mt-2 space-y-2">
            {available[g].map((tg) => {
              const id = `report-head-${tg}`
              return (
                <li key={tg} className="flex items-center gap-2.5">
                  <Checkbox id={id} checked={!off.has(tg)} onCheckedChange={(v) => onToggle(tg, v === true)} />
                  <label htmlFor={id} className="cursor-pointer text-sm text-foreground">
                    {g === "facts" ? t(`tasks.report.facts.${tg}`) : t(`tasks.report.head.items.${tg}`)}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * "In this report": a switch per section the report actually HAS, and — in the
 * client copy — what the office chooses to add back for the client.
 */
export function ReportRail({
  copy,
  available,
  off,
  onToggle,
  include,
  onInclude,
  canIncludeRoute,
}: {
  copy: TaskReportCopy
  available: readonly ReportToggle[]
  off: ReadonlySet<ReportToggle>
  onToggle: (tg: ReportToggle, on: boolean) => void
  include: readonly ClientCopyOption[]
  onInclude: (opt: ClientCopyOption, on: boolean) => void
  /** The route is only ever added for a reader who may see tracking. */
  canIncludeRoute: boolean
}) {
  const { t } = useTranslation()
  const options = CLIENT_COPY_OPTIONS.filter((o) => o !== "route" || canIncludeRoute)
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("tasks.report.rail.inThisReport")}</h2>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("tasks.report.rail.inThisReportHint")}</p>
        {available.length ? (
          <ul className="mt-3 space-y-2">
            {available.map((tg) => {
              const id = `report-toggle-${tg}`
              return (
                <li key={tg} className="flex items-center gap-2.5">
                  <Checkbox id={id} checked={!off.has(tg)} onCheckedChange={(v) => onToggle(tg, v === true)} />
                  <label htmlFor={id} className="cursor-pointer text-sm text-foreground">{t(`tasks.report.toggles.${tg}`)}</label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t("tasks.report.rail.nothing")}</p>
        )}
      </div>

      {copy === "client" ? (
        <div>
          <p className="rounded-lg bg-muted/60 p-3 text-[11px] leading-snug text-muted-foreground">{t("tasks.report.rail.clientHint")}</p>
          <h2 className="mt-4 text-sm font-semibold text-foreground">{t("tasks.report.rail.alsoShow")}</h2>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("tasks.report.rail.alsoShowHint")}</p>
          <ul className="mt-3 space-y-2.5">
            {options.map((o) => {
              const id = `report-include-${o}`
              return (
                <li key={o} className="flex items-center justify-between gap-3">
                  <label htmlFor={id} className="cursor-pointer text-sm text-foreground">{t(`tasks.report.include.${o}`)}</label>
                  <Switch id={id} checked={include.includes(o)} onCheckedChange={(v) => onInclude(o, v)} />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )
}
