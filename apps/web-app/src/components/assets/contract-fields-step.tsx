"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2 } from "lucide-react"
import { type AssetCategory, type ContractFields } from "@/lib/api"
import { kindHolderLabel, personName, type KindShape } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import { ContractFieldInput } from "./contract-field-input"
import type { ContractFieldKey, ContractMember } from "./use-contract-dialog"

/** One box, coloured by whether the reader could prove what it put in it. */
function ReadField({
  label,
  value,
  confidence,
  onChange,
}: {
  label: string
  value: string
  confidence?: "certain" | "likely"
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5",
        !confidence ? "border-border" : confidence === "certain" ? "border-emerald-500/45" : "border-amber-500/50",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {confidence && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide",
              confidence === "certain"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
            )}
          >
            {confidence === "certain" ? t("scan.found", "FOUND") : t("scan.check", "CHECK")}
          </span>
        )}
      </div>
      <ContractFieldInput value={value} onChange={onChange} />
    </div>
  )
}

/**
 * Step 2 of reading a contract: what it made of it — the kind, who gets it, the six boxes (green was read,
 * amber was guessed) and whether to retire what it replaces.
 */
export function ContractFieldsStep({
  usable,
  categoryId,
  setCategoryId,
  shape,
  members,
  holderUserId,
  setHolderUserId,
  fields,
  setFields,
  confidence,
  named,
  retire,
  setRetire,
  ready,
  asking,
  onAsk,
  onBack,
}: {
  usable: AssetCategory[]
  categoryId: string
  setCategoryId: (id: string) => void
  shape: KindShape
  members: ContractMember[]
  holderUserId: string
  setHolderUserId: (id: string) => void
  fields: ContractFields
  setFields: Dispatch<SetStateAction<ContractFields>>
  confidence: (key: ContractFieldKey) => "certain" | "likely" | undefined
  named: boolean
  retire: boolean
  setRetire: (retire: boolean) => void
  ready: boolean
  /** The preview is being asked for. */
  asking: boolean
  onAsk: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("contract.kind", "What kind of thing")}</Label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">{t("contract.pickKind", "Choose…")}</option>
          {usable.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        {usable.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t(
              "contract.noKinds",
              "No type in this workspace is held by a member — a contract has nobody to hand it to.",
            )}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{kindHolderLabel(shape, t("contract.holder", "Who gets it"))}</Label>
        <select
          value={holderUserId}
          onChange={(e) => setHolderUserId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">{t("contract.pickHolder", "Choose…")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {personName(m)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ReadField
          label={t("contract.fRegistration", "Registration")}
          value={fields.registration ?? ""}
          confidence={confidence("registration")}
          onChange={(v) => setFields((f) => ({ ...f, registration: v }))}
        />
        <ReadField
          label={t("contract.fVin", "VIN / serial")}
          value={fields.vin ?? ""}
          confidence={confidence("vin")}
          onChange={(v) => setFields((f) => ({ ...f, vin: v }))}
        />
        <ReadField
          label={t("contract.fManufacturer", "Make")}
          value={fields.manufacturer ?? ""}
          confidence={confidence("manufacturer")}
          onChange={(v) => setFields((f) => ({ ...f, manufacturer: v }))}
        />
        <ReadField
          label={t("contract.fModel", "Model")}
          value={fields.model ?? ""}
          confidence={confidence("model")}
          onChange={(v) => setFields((f) => ({ ...f, model: v }))}
        />
        <ReadField
          label={t("contract.fStarts", "Term starts")}
          value={fields.startsOn ?? ""}
          confidence={confidence("startsOn")}
          onChange={(v) => setFields((f) => ({ ...f, startsOn: v }))}
        />
        <ReadField
          label={t("contract.fEnds", "Term ends")}
          value={fields.endsOn ?? ""}
          confidence={confidence("endsOn")}
          onChange={(v) => setFields((f) => ({ ...f, endsOn: v }))}
        />
      </div>

      {!named && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("contract.needName", "Nothing here identifies it yet — a registration, a VIN, or a make and model.")}
        </p>
      )}

      {/*
              A record must never be created from a reading nobody looked at, so
              this step cannot be skipped — but it is one click, and the box
              below is the whole reason the flow is worth having.
            */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
        <Checkbox checked={retire} onCheckedChange={(v) => setRetire(v === true)} className="mt-0.5" />
        <span className="text-sm">
          <span className="font-medium text-foreground">{t("contract.retire", "Retire what it replaces")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("contract.retireHint", "Keeps its history and its jobs, and stops it being billed.")}
          </span>
        </span>
      </label>

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back", "Back")}
        </Button>
        <Button disabled={!ready || asking} onClick={onAsk}>
          {asking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {t("contract.next", "See what happens")} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  )
}
