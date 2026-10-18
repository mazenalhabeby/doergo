"use client"

import { Plus, Minus } from "lucide-react"
import { moduleI18n } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { MODULE_LABEL } from "./modules-tab-helpers"
import type { ModulesTabState } from "./use-modules-tab"

/** Part of ModulesTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ModulesTabUnsavedCount({ vm }: { vm: ModulesTabState }) {
  const { dirty, t, added, removed, setEnabledModules, saved, mutation, enabledModules } = vm
  return (
    <>
      {dirty && (
        <div className="sticky bottom-3 z-20 pt-2">
          <div
            className={
              "flex flex-wrap items-center gap-3 rounded-xl border border-border " +
              "bg-card/95 p-3 shadow-lg backdrop-blur " +
              "supports-[backdrop-filter]:bg-card/80"
            }
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t("locations.unsavedCount", "{{count}} unsaved change", { count: added.length + removed.length })}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {added.map((m) => (
                  <span
                    key={m}
                    className={
                      "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 " +
                      "py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    <Plus className="h-3 w-3" />
                    {t(moduleI18n.label(m), { defaultValue: MODULE_LABEL[m] || m })}
                  </span>
                ))}
                {removed.map((m) => (
                  <span
                    key={m}
                    className={
                      "inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 " +
                      "text-[11px] font-medium text-red-600 dark:text-red-400"
                    }
                  >
                    <Minus className="h-3 w-3" />
                    {t(moduleI18n.label(m), { defaultValue: MODULE_LABEL[m] || m })}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEnabledModules(saved)} disabled={mutation.isPending}>
                {t("common.discard", "Discard")}
              </Button>
              <Button size="sm" onClick={() => mutation.mutate(enabledModules)} disabled={mutation.isPending}>
                {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
