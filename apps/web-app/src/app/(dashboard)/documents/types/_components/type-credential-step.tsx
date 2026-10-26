"use client"

import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Step, Toggle } from "./type-editor-controls"
import type { TypeEditorForm } from "../_hooks/use-type-editor"

/** Step 4: is it a credential — does it expire, and which kinds of task does it gate. */
export function TypeCredentialStep({
  isCredential,
  setIsCredential,
  hasExpiry,
  setHasExpiry,
  setGates,
  gates,
  workflows,
}: Pick<TypeEditorForm, "isCredential" | "setIsCredential" | "hasExpiry" | "setHasExpiry" | "setGates" | "gates"> & {
  workflows: { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  return (
    <Step n={4} title={t("documents.types.step4")}>
      <Toggle
        checked={isCredential}
        onChange={(v) => {
          setIsCredential(v)
          // A certificate that does not expire is legitimate, but the
          // common case by far is one that does.
          if (v && !hasExpiry) setHasExpiry(true)
          if (!v) setGates([])
        }}
        title={t("documents.types.isCredential")}
        hint={t("documents.types.isCredentialHint")}
      />

      {isCredential && (
        <div className="mt-3 space-y-3 border-l-2 border-amber-300 pl-4 dark:border-amber-800">
          <Toggle
            checked={hasExpiry}
            onChange={setHasExpiry}
            title={t("documents.types.hasExpiry")}
            hint={t("documents.types.hasExpiryHint")}
          />

          <div>
            <p className="text-sm font-medium text-foreground">{t("documents.types.gates")}</p>
            <p className="mb-2 text-xs text-muted-foreground">{t("documents.types.gatesHint")}</p>
            {workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("documents.types.noTaskTypes")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {workflows.map((w) => {
                  const on = gates.includes(w.id)
                  return (
                    <button
                      key={w.id}
                      onClick={() => setGates((g) => (on ? g.filter((x) => x !== w.id) : [...g, w.id]))}
                      className={cn(
                        "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                        on
                          ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {w.name}
                    </button>
                  )
                })}
              </div>
            )}
            {gates.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("documents.types.gatesWarning", { count: gates.length })}
              </p>
            )}
          </div>
        </div>
      )}
    </Step>
  )
}
