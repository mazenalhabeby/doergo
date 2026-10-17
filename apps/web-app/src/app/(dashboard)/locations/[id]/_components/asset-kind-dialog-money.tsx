"use client"

import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Wallet } from "lucide-react"
import { KIND_SHAPE_LIMITS } from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Row, DirBtn } from "./asset-kind-dialog-helpers"
import type { AssetKindDialogState } from "./use-asset-kind-dialog"

/** Part of AssetKindDialog's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AssetKindDialogMoney({ vm }: { vm: AssetKindDialogState }) {
  const { t, shape, setMoney, setCategory } = vm
  return (
    <div className="rounded-xl border border-border">
      <Row
        icon={Wallet}
        title={t("assetKinds.money", "It costs or earns money")}
        hint={t("assetKinds.moneyHint", "Log what comes in and what goes out, with dates and a running total.")}
        checked={shape.money.enabled}
        onChange={(v) => setMoney({ enabled: v })}
        bare
      />
      {shape.money.enabled && (
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
              disabled={shape.money.categories.length >= KIND_SHAPE_LIMITS.maxMoneyCategories}
              onClick={() => setMoney({ categories: [...shape.money.categories, { label: "", direction: "out" }] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
            </button>
          </div>

          {shape.money.categories.map((c, i) => (
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
                onClick={() => setMoney({ categories: shape.money.categories.filter((_, idx) => idx !== i) })}
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
