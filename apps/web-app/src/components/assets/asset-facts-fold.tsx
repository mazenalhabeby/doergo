"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight } from "lucide-react"
import { ASSET_RECORD_LIMITS, type AssetDateProblem } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Facts } from "./asset-record"

/** "More about it": the plate — serial, maker, model, the two dates and notes — behind a fold. */
export function AssetFactsFold({
  moreOpen,
  setMoreOpen,
  facts,
  setFacts,
  dateProblems,
}: {
  moreOpen: boolean
  setMoreOpen: Dispatch<SetStateAction<boolean>>
  facts: Facts
  setFacts: Dispatch<SetStateAction<Facts>>
  dateProblems: AssetDateProblem[]
}) {
  const { t } = useTranslation()
  const setFact = (key: keyof Facts, value: string) => setFacts((f) => ({ ...f, [key]: value }))
  return (
    <div className="mt-3 rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {moreOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {t("assetFacts.more.title", "More about it")}
      </button>
      {moreOpen && (
        <div className="grid gap-2.5 border-t border-border p-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("assetFacts.more.serial", "Serial number")}</Label>
            <Input
              value={facts.serialNumber}
              maxLength={ASSET_RECORD_LIMITS.serialNumber}
              onChange={(e) => setFact("serialNumber", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("assetFacts.more.manufacturer", "Manufacturer")}</Label>
            <Input
              value={facts.manufacturer}
              maxLength={ASSET_RECORD_LIMITS.manufacturer}
              onChange={(e) => setFact("manufacturer", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("assetFacts.more.model", "Model")}</Label>
            <Input
              value={facts.model}
              maxLength={ASSET_RECORD_LIMITS.model}
              onChange={(e) => setFact("model", e.target.value)}
            />
          </div>
          <div className="hidden sm:block" />
          <div className="space-y-1">
            <Label className="text-xs">{t("assetFacts.more.installDate", "Installed on")}</Label>
            <Input type="date" value={facts.installDate} onChange={(e) => setFact("installDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("assetFacts.more.warrantyExpiry", "Warranty until")}</Label>
            <Input
              type="date"
              value={facts.warrantyExpiry}
              min={facts.installDate || undefined}
              onChange={(e) => setFact("warrantyExpiry", e.target.value)}
              className={cn(dateProblems.length > 0 && "border-destructive")}
            />
          </div>
          {dateProblems.length > 0 && (
            <p className="text-[11px] text-destructive sm:col-span-2">
              {dateProblems.includes("warranty-before-install")
                ? t(
                    "assetFacts.dates.warrantyBeforeInstall",
                    "The warranty cannot end before the date it was installed.",
                  )
                : t("assetFacts.dates.invalid", "That date could not be read.")}
            </p>
          )}
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{t("assetFacts.more.notes", "Notes")}</Label>
            <Textarea
              value={facts.notes}
              maxLength={ASSET_RECORD_LIMITS.notes}
              onChange={(e) => setFact("notes", e.target.value)}
              placeholder={t(
                "assetFacts.more.notesPh",
                "Anything worth knowing — where it came from, what to watch for…",
              )}
              rows={3}
            />
          </div>
        </div>
      )}
    </div>
  )
}
