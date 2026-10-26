"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { moduleI18n, TYPE_CAPABILITY_MODULE } from "@hbcfield/shared/client"
import { Label } from "@/components/ui/label"
import { TYPE_CAPABILITY_CHIPS } from "./capabilities"

/** What the TASK carries, as opposed to what a member does at a step. */
export function TypeCapabilityChips({
  typeCapabilities,
  setTypeCapabilities,
  moduleOn,
}: {
  typeCapabilities: string[]
  setTypeCapabilities: Dispatch<SetStateAction<string[]>>
  moduleOn: (key: string) => boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{t("workflows.builder.typeCapabilities", "This task type uses")}</Label>
      <div className="flex flex-wrap gap-1.5">
        {TYPE_CAPABILITY_CHIPS.map((cap) => {
          const on = typeCapabilities.includes(cap.key)
          const unmet = on && !moduleOn(TYPE_CAPABILITY_MODULE[cap.key] ?? "")
          return (
            <button
              key={cap.key}
              type="button"
              onClick={() =>
                setTypeCapabilities((prev) =>
                  prev.includes(cap.key) ? prev.filter((c) => c !== cap.key) : [...prev, cap.key],
                )
              }
              title={
                unmet
                  ? t("workflows.capabilities.moduleOff", {
                      module: t(moduleI18n.label(TYPE_CAPABILITY_MODULE[cap.key] ?? ""), {
                        defaultValue: TYPE_CAPABILITY_MODULE[cap.key],
                      }),
                      defaultValue: 'The "{{module}}" module is off in this space, so this step cannot do it yet.',
                    })
                  : undefined
              }
              className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                unmet
                  ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                  : on
                    ? "border-primary bg-shell-accent-soft text-shell-accent"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {unmet && "⚠ "}
              {t(cap.labelKey, cap.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
