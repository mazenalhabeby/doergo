"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Step, Toggle } from "./editor-parts"
import type { TypeEditorState } from "./use-type-editor-logic"
import type { TypeEditor } from "./type-editor"

/** Part of TypeEditor's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TypeEditorTypes2({ vm, workflows }: { vm: TypeEditorState; workflows: Parameters<typeof TypeEditor>[0]['workflows'] }) {
  const {
    t,
    isCredential,
    setIsCredential,
    hasExpiry,
    setHasExpiry,
    setGates,
    gates,
  } = vm
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
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("documents.types.gates")}
            </p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {t("documents.types.gatesHint")}
            </p>
            {workflows.length === 0 ? (
              <p className="text-sm text-slate-400">{t("documents.types.noTaskTypes")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {workflows.map((w) => {
                  const on = gates.includes(w.id)
                  return (
                    <button
                      key={w.id}
                      onClick={() => setGates((g) =>
                        on ? g.filter((x) => x !== w.id) : [...g, w.id],
                      )}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
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
