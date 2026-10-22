"use client"

import { useTranslation } from "react-i18next"
import {
  AVAILABLE_MODULES,
  moduleI18n,
  moduleRequires,
  moduleMonthlyCents,
  formatCents,
  billsByUsage,
  includedUnits,
  marginalUnitCents,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { ExplainerButton } from "@/components/explainer/explainer-button"
import { MODULE_LABEL } from "./module-labels"

/**
 * One module's switch: its name and help, its price (and, for a counted module, what the next unit costs),
 * and what it needs switched on first.
 */
export function ModuleRow({
  mod,
  enabledModules,
  hasUsage,
  unitsFor,
  toggleModule,
}: {
  mod: (typeof AVAILABLE_MODULES)[number]
  enabledModules: string[]
  /** Whether this space's counts have loaded — until then a counted module says what is included. */
  hasUsage: boolean
  unitsFor: (key: string) => number
  toggleModule: (key: string) => void
}) {
  const { t } = useTranslation()
  const isEnabled = enabledModules.includes(mod.key)
  const unmet = moduleRequires(mod.key).filter((r) => !enabledModules.includes(r))
  const locked = !isEnabled && unmet.length > 0
  return (
    /*
        ⚠️ `htmlFor` is load-bearing, not tidiness.

        A <label> with no `for` controls the first LABELABLE descendant
        in tree order — and <button> is labelable. The explainer "i"
        sits before the checkbox here, so the label's control was the
        BUTTON: clicking the switch opened the description and never
        toggled the module. Naming the control explicitly ends the
        argument, whatever order the row is later rearranged into.

        (The same two components in space-modules-picker.tsx happen to put the
        checkbox first, which is why only this screen was broken.)
      */
    <label
      key={mod.key}
      htmlFor={`module-${mod.key}`}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors",
        isEnabled
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "border-border hover:bg-muted/50",
        locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <div className="flex-1 min-w-0 mr-3">
        <span className="text-sm font-medium text-foreground">
          {t(moduleI18n.label(mod.key), { defaultValue: mod.label })}
        </span>
        {/* This row is a <label> around the toggle, so the button
              stops its own click — otherwise opening the help also
              switches the module. See ExplainerButton. */}
        <ExplainerButton
          explainerKey={mod.key}
          title={t(moduleI18n.label(mod.key), { defaultValue: mod.label })}
          scope="workspace"
          priceLabel={`${formatCents(moduleMonthlyCents(mod.key))}${t("billing.perMonthShort", "/mo")}`}
          enabled={isEnabled}
          className="ml-1.5 align-middle"
        />
        {/* The price sits on the row being toggled. Anywhere else and
              somebody has to hold two screens in their head to answer
              "what does this one cost". */}
        <span
          className={cn(
            "ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            isEnabled
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {formatCents(moduleMonthlyCents(mod.key))}
          <span className="opacity-70">{t("billing.perMonthShort", "/mo")}</span>
        </span>
        {/* A counted module's row price is only its base, so the row
              says what the count costs too — otherwise the cheapest
              badge on the screen belongs to the module that can grow
              the largest bill. */}
        {billsByUsage(mod.key) && (
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {hasUsage && marginalUnitCents(mod.key, unitsFor(mod.key)) > 0
              ? t("billing.usage.perUnitShort", "+{{price}} each", {
                  price: formatCents(marginalUnitCents(mod.key, unitsFor(mod.key))),
                })
              : t("billing.usage.included", "First {{count}} included", {
                  count: includedUnits(mod.key),
                })}
          </span>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(moduleI18n.description(mod.key), { defaultValue: mod.description })}
        </p>
        {locked && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-500 mt-1">
            🔒{" "}
            {t("locations.moduleRequires", "Requires {{modules}}", {
              modules: unmet.map((r) => t(moduleI18n.label(r), { defaultValue: MODULE_LABEL[r] || r })).join(", "),
            })}
          </p>
        )}
      </div>
      <div className="relative inline-flex items-center shrink-0">
        <input
          id={`module-${mod.key}`}
          type="checkbox"
          checked={isEnabled}
          disabled={locked}
          onChange={() => toggleModule(mod.key)}
          className="sr-only peer"
        />
        <div
          className={
            "w-9 h-5 bg-muted rounded-full peer peer-checked:bg-emerald-600 " +
            "peer-disabled:opacity-50 transition-colors after:content-[''] " +
            "after:absolute after:top-0.5 after:left-[2px] after:bg-white " +
            "after:rounded-full after:h-4 after:w-4 after:transition-all " +
            "peer-checked:after:translate-x-full"
          }
        />
      </div>
    </label>
  )
}
