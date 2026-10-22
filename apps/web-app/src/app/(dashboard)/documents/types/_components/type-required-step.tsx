"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Step, Toggle } from "./type-editor-controls"
import type { TypeEditorForm } from "../_hooks/use-type-editor"

/** Step 5 for a supplied document: is it required, and from everyone or from some roles. */
export function TypeRequiredStep({
  direction,
  requiredFromAll,
  requiredFromRoleIds,
  setRequiredFromAll,
  setRequiredFromRoleIds,
  roles,
}: Pick<
  TypeEditorForm,
  "direction" | "requiredFromAll" | "requiredFromRoleIds" | "setRequiredFromAll" | "setRequiredFromRoleIds"
> & { roles: { id: string; name: string }[] }) {
  const { t } = useTranslation()
  return (
    <>
      {direction !== "ISSUED" && (
        <Step n={5} title={t("documents.types.stepRequired")}>
          <Toggle
            checked={requiredFromAll || requiredFromRoleIds.length > 0}
            onChange={(v) => {
              setRequiredFromAll(v)
              if (!v) setRequiredFromRoleIds([])
            }}
            title={t("documents.types.isRequired")}
            hint={t("documents.types.isRequiredHint")}
          />

          {(requiredFromAll || requiredFromRoleIds.length > 0) && (
            <div className="mt-3 space-y-2 border-l-2 border-blue-300 pl-4 dark:border-blue-800">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("documents.types.requiredFromWho")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setRequiredFromAll(true)
                    setRequiredFromRoleIds([])
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    requiredFromAll
                      ? "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                  )}
                >
                  {t("documents.types.everyone")}
                </button>
                {roles.map((r) => {
                  const on = !requiredFromAll && requiredFromRoleIds.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRequiredFromAll(false)
                        setRequiredFromRoleIds((ids) =>
                          ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id],
                        )
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400",
                      )}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("documents.types.requiredNote")}</p>
            </div>
          )}
        </Step>
      )}
    </>
  )
}
