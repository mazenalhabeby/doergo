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
            <div className="mt-3 space-y-2 border-l-2 border-primary pl-4">
              <p className="text-sm font-medium text-foreground">{t("documents.types.requiredFromWho")}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setRequiredFromAll(true)
                    setRequiredFromRoleIds([])
                  }}
                  className={cn(
                    "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                    requiredFromAll
                      ? "border-primary bg-shell-accent-soft text-shell-accent"
                      : "border-border text-muted-foreground hover:bg-accent",
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
                        "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                        on
                          ? "border-primary bg-shell-accent-soft text-shell-accent"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("documents.types.requiredNote")}</p>
            </div>
          )}
        </Step>
      )}
    </>
  )
}
