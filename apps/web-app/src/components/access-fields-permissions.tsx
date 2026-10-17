"use client"

import { Check } from "lucide-react"
import type { AccessDraft } from "@hbcfield/shared/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Field } from "./use-access-fields"
import { TASK_SCOPES } from "./access-fields-helpers"
import type { AccessFieldsState } from "./use-access-fields"
import type { AccessFields } from "./access-fields"

/** Part of AccessFields's markup, moved here unchanged; it reads the page's state from `vm`. */
export function AccessFieldsPermissions({ vm, external, value, onChange }: { vm: AccessFieldsState; external: NonNullable<Parameters<typeof AccessFields>[0]['external']>; value: Parameters<typeof AccessFields>[0]['value']; onChange: Parameters<typeof AccessFields>[0]['onChange'] }) {
  const { t, permView, selectedRole } = vm
  return (
    <>{!external && (
    <Field dataTour="access-permissions" label={t("accessBuilder.permissions")}>
      <div className="space-y-3">
        {permView.groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t("accessBuilder.noPermissions", "This role grants no permissions yet. Choose a role above, or add permissions to it in Roles.")}
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("accessBuilder.fromRole", "From the role {{role}}", {
                role: value.systemRole === "ADMIN"
                  ? t("accessBuilder.adminRole", "Admin")
                  : selectedRole?.name ?? "",
              })}
            </p>
            <div className="space-y-3">
              {permView.groups.map(([domain, perms]) => (
                <div key={domain}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t(`accessBuilder.domains.${domain}`, domain)}
                  </p>
                  <ul className="space-y-1">
                    {perms.map((p) => (
                      <li key={p.key} className="flex items-start gap-2 text-xs">
                        <Check className={cn("mt-0.5 size-3 shrink-0", p.direct ? "text-amber-600" : "text-primary")} />
                        <span className="min-w-0">
                          <span className="font-medium text-foreground">{p.label}</span>
                          <span className="text-muted-foreground"> — {p.description}</span>
                          {p.direct && (
                            <>
                              <span className="ml-1.5 whitespace-nowrap rounded border border-amber-600/40 bg-amber-600/10 px-1 py-px text-[10px] font-medium text-amber-700 dark:text-amber-500">
                                {t("accessBuilder.directGrant", "Granted to this member only")}
                              </span>
                              <button
                                type="button"
                                onClick={() => onChange({ [p.key]: false } as Partial<AccessDraft>)}
                                className="ml-1.5 text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                              >
                                {t("accessBuilder.removeDirectGrant", "Remove")}
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {permView.directCount > 0
                ? t("accessBuilder.directGrantHint", "Highlighted permissions were granted to this member directly, not by the role. They can be removed here but not added — put them on a role instead, so it is visible who holds them.")
                : t("accessBuilder.fromRoleHint", "Change these on the role itself — they apply to everyone who holds it.")}
            </p>
          </div>
        )}

        {/* Task creation SCOPE is a per-member setting, not a permission: it
            narrows where this person may create, once the role lets them. */}
        {(value.systemRole === "ADMIN" || selectedRole?.permissions?.canCreateTasks === true || value.canCreateTasks) && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("accessBuilder.taskScope.title", "Where they can create tasks")}</p>
              <p className="text-xs text-muted-foreground">{t("accessBuilder.taskScope.desc", "Narrows task creation for this member only.")}</p>
            </div>
            <Select value={value.taskCreationScope} onValueChange={(v) => onChange({ taskCreationScope: v })}>
              <SelectTrigger className="h-8 w-[190px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_SCOPES.map((sc) => (
                  <SelectItem key={sc.key} value={sc.key} className="text-xs">{t(sc.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </Field>
    )}</>
  )
}
