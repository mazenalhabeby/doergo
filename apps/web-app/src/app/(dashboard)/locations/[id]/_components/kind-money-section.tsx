"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Wallet } from "lucide-react"
import { KIND_SHAPE_LIMITS, type KindShape, type MoneyDirection } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KindOptionRow } from "./kind-option-row"

/**
 * Money. The kind names the headings, so an Apartments kind logs Rent and Repairs while a Vehicles kind
 * logs Fuel and Service — one ledger, different words. Each heading is money in or money out.
 */
export function KindMoneySection({
  money,
  setShape,
}: {
  money: KindShape["money"]
  setShape: React.Dispatch<React.SetStateAction<KindShape>>
}) {
  const { t } = useTranslation()
  const setMoney = (patch: Partial<KindShape["money"]>) => setShape((s) => ({ ...s, money: { ...s.money, ...patch } }))
  const setCategory = (i: number, patch: { label?: string; direction?: MoneyDirection }) =>
    setShape((s) => ({
      ...s,
      money: {
        ...s.money,
        categories: s.money.categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
      },
    }))
  return (
    <div className="rounded-xl border border-border">
      <KindOptionRow
        icon={Wallet}
        title={t("assetKinds.money", "It costs or earns money")}
        hint={t("assetKinds.moneyHint", "Log what comes in and what goes out, with dates and a running total.")}
        checked={money.enabled}
        onChange={(v) => setMoney({ enabled: v })}
        bare
      />
      {money.enabled && (
        <div className="space-y-2 border-t border-border p-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs text-muted-foreground">
                {t("assetKinds.moneyCategories", "What money gets logged under")}
              </Label>
              <p className="text-[11px] text-muted-foreground/70">
                {t("assetKinds.moneyCategoriesHint", "Rent, Repairs, Utilities — or Fuel, Service, Insurance.")}
              </p>
            </div>
            <button
              type="button"
              disabled={money.categories.length >= KIND_SHAPE_LIMITS.maxMoneyCategories}
              onClick={() => setMoney({ categories: [...money.categories, { label: "", direction: "out" }] })}
              className={
                "inline-flex items-center gap-1 text-xs font-medium text-primary " +
                "hover:underline disabled:opacity-40 disabled:no-underline"
              }
            >
              <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
            </button>
          </div>

          {money.categories.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={c.label}
                onChange={(e) => setCategory(i, { label: e.target.value })}
                placeholder={t("assetKinds.moneyCategoryPh", "Rent")}
                maxLength={KIND_SHAPE_LIMITS.maxLabel}
              />
              {/* In or out is a property of the heading, not of each entry:
                  rent is always money in, a repair is always money out. */}
              <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                <DirBtn
                  active={c.direction === "in"}
                  onClick={() => setCategory(i, { direction: "in" })}
                  icon={ArrowDownLeft}
                  label={t("assetKinds.moneyIn", "Money in")}
                  tone="in"
                />
                <DirBtn
                  active={c.direction === "out"}
                  onClick={() => setCategory(i, { direction: "out" })}
                  icon={ArrowUpRight}
                  label={t("assetKinds.moneyOut", "Money out")}
                  tone="out"
                />
              </div>
              <button
                type="button"
                onClick={() => setMoney({ categories: money.categories.filter((_, idx) => idx !== i) })}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
                aria-label={t("common.remove", "Remove")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** In or out, for one money heading. */
function DirBtn({
  active,
  onClick,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ArrowDownLeft
  label: string
  tone: "in" | "out"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
        active
          ? tone === "in"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
