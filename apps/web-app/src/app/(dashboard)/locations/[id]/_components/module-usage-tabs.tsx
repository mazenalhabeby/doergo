"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AVAILABLE_MODULES,
  formatCents,
  moduleI18n,
  moduleMonthlyCents,
  usageCost,
} from "@hbcfield/shared/client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { ModuleUsagePanel } from "./module-usage-panel"

/**
 * The counted modules, one at a time.
 *
 * Each ladder panel is worth its height on its own — it answers what the next
 * unit costs and how far the next price drop is — but there are three of them
 * now, and stacked they ran to most of a screen and pushed the module toggles,
 * the actual point of the tab, below the fold. A space with CRM, Client Portal
 * and Assets on was scrolling past 750px of pricing table to reach a switch.
 *
 * So one is open at a time. What that would normally cost is the ability to
 * compare them, which is exactly what someone is here to do — so the price each
 * module is running at stays ON its tab, and the totals are legible without
 * opening anything. Switching tabs then answers "why", not "how much".
 *
 * Below two, this renders nothing extra: a tab strip over a single panel is
 * chrome around a decision nobody has to make.
 */
export function ModuleUsageTabs({
  moduleKeys,
  unitsFor,
}: {
  /** Counted modules this space has switched on. */
  moduleKeys: string[]
  /** How many units of a module sit in this space. */
  unitsFor: (moduleKey: string) => number
}) {
  const { t } = useTranslation()

  const priced = moduleKeys.map((key) => {
    const units = unitsFor(key)
    const usage = usageCost(key, units)
    return {
      key,
      units,
      usageCents: usage.monthlyCents,
      // Base + ladder. The base alone is the number that misleads: a module can
      // read €15 on its tab while its count is quietly adding €200.
      totalCents: moduleMonthlyCents(key) + usage.monthlyCents,
    }
  })

  /*
    Open the one that is actually costing something, not simply the first.

    Somebody arriving at this screen is nearly always here about a number that
    moved, and the module with the largest ladder bill is the likeliest reason.
    When nothing is over its allowance — the common, happy case — the order the
    modules were switched on in is as good as any.
  */
  const [chosen, setChosen] = useState<string | undefined>(undefined)

  const suggested = (() => {
    const dearest = [...priced].sort((a, b) => b.usageCents - a.usageCents)[0]
    return dearest && dearest.usageCents > 0 ? dearest.key : priced[0]?.key
  })()

  /*
    Never point at a module that is no longer here.

    These tabs sit directly above the switches that add and remove them, so the
    open tab disappearing under the user is the normal case, not an edge one.
    Holding the choice in state alone would leave Radix matching nothing and
    render an empty space where the panel used to be.
  */
  const active = chosen && priced.some((m) => m.key === chosen) ? chosen : suggested

  if (priced.length === 0) return null
  if (priced.length === 1) return <ModuleUsagePanel moduleKey={priced[0]!.key} units={priced[0]!.units} />

  return (
    <Tabs value={active} onValueChange={setChosen} className="w-full">
      {/*
        Full width, equal columns. Sized to its content the strip read as a
        narrow grey blob floating between two full-width cards, and left-aligned
        two-line labels made the prices look ragged rather than tabulated.
        Spanning the panel it introduces, in even columns, it reads as that
        panel's header instead of as loose furniture between two things.

        Equal columns rather than a scrolling row: three or four counted modules
        is the realistic ceiling, and a grid cannot change height when one is
        switched on — which matters, because this sits directly above the
        toggles doing the switching.
      */}
      <TabsList
        className="grid h-auto w-full gap-1 p-1"
        style={{ gridTemplateColumns: `repeat(${priced.length}, minmax(0, 1fr))` }}
      >
        {priced.map((m) => {
          const englishLabel = AVAILABLE_MODULES.find((x) => x.key === m.key)?.label ?? m.key
          const label = t(moduleI18n.label(m.key), { defaultValue: englishLabel })
          return (
            <TabsTrigger
              key={m.key}
              value={m.key}
              className="flex-col items-center gap-1 px-2 py-2 data-[state=active]:shadow-sm"
            >
              {/* Truncates rather than wraps: "Kundenportal" and "B2C-Portal"
                  are not the same width, and a label that wraps in one column
                  makes every tab in the row taller. */}
              <span className="w-full truncate text-center text-sm font-medium leading-none">{label}</span>
              <span
                className={cn(
                  "text-[11px] leading-none tabular-nums",
                  // Over its allowance is the state worth noticing, so it is
                  // the only one that gets colour.
                  m.usageCents > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}
              >
                {formatCents(m.totalCents)}
                {t("billing.usage.perMonthShort", "/mo")}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>

      {priced.map((m) => (
        <TabsContent key={m.key} value={m.key} className="mt-2">
          <ModuleUsagePanel moduleKey={m.key} units={m.units} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
