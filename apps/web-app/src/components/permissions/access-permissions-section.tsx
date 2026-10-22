"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { ACCESS_PERMISSION_SCHEMA } from "@hbcfield/shared/client"
import type { AccessDraft } from "@hbcfield/shared/client"
import type { AccessRole } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Field } from "./access-field"
import { TASK_SCOPES } from "./access-field-options"
import type { AccessFieldsProps } from "./access-field-types"

/**
 * The five permissions that still have their own column on the User row, and so
 * can be granted to ONE member on top of whatever their role gives them.
 *
 * They are no longer editable here. Resolved access merges the role and these
 * columns with a union (mergePermissions only ever sets true), so a per-member
 * switch could add a capability but never take one away: unticking "Allow
 * reports" on someone whose role grants it changed nothing, while looking
 * exactly like a restriction. A control that cannot do the thing it appears to
 * do is worse than no control.
 *
 * Existing grants are still SHOWN — and only here — because they are otherwise
 * invisible drift: nothing on the roles page reveals that one member was handed
 * an extra capability years ago. They can be cleared, not created.
 */
export const LEGACY_DIRECT_KEYS = [
  "canCreateTasks",
  "canAssignTasks",
  "canViewAllTasks",
  "canManageUsers",
  "canViewReports",
] as const

/**
 * Permissions — read-only. Every capability this member holds, grouped by domain and attributed to
 * the role or to a direct grant on the member, plus the per-member task creation scope.
 */
export function AccessPermissionsSection({
  value,
  onChange,
  selectedRole,
}: Pick<AccessFieldsProps, "value" | "onChange"> & { selectedRole: AccessRole | undefined }) {
  const { t } = useTranslation()

  /**
   * Every permission this member effectively holds, grouped by domain and
   * attributed to where it comes from — the role, or a direct grant on the
   * member. Admin holds the whole catalogue, so show it rather than an empty
   * box: "Admin" saying nothing about overtime or clients is exactly the
   * silence this block exists to remove.
   */
  const permView = useMemo(() => {
    const isAdmin = value.systemRole === "ADMIN"
    const direct = new Set(LEGACY_DIRECT_KEYS.filter((k) => value[k] === true))
    const rows = ACCESS_PERMISSION_SCHEMA.flatMap((p) => {
      const fromRole = isAdmin || selectedRole?.permissions?.[p.key] === true
      if (fromRole) return [{ ...p, direct: false }]
      if (direct.has(p.key as (typeof LEGACY_DIRECT_KEYS)[number])) return [{ ...p, direct: true }]
      return []
    })
    const byDomain = new Map<string, typeof rows>()
    for (const p of rows) {
      const list = byDomain.get(p.domain) ?? []
      list.push(p)
      byDomain.set(p.domain, list)
    }
    return { groups: [...byDomain.entries()], directCount: rows.filter((r) => r.direct).length }
  }, [value, selectedRole])

  return (
    <Field dataTour="access-permissions" label={t("accessBuilder.permissions")}>
      <div className="space-y-3">
        {permView.groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {t(
              "accessBuilder.noPermissions",
              "This role grants no permissions yet. Choose a role above, or add " + "permissions to it in Roles.",
            )}
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("accessBuilder.fromRole", "From the role {{role}}", {
                role: value.systemRole === "ADMIN" ? t("accessBuilder.adminRole", "Admin") : (selectedRole?.name ?? ""),
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
                              <span
                                className={
                                  "ml-1.5 whitespace-nowrap rounded border border-amber-600/40 " +
                                  "bg-amber-600/10 px-1 py-px text-[10px] font-medium text-amber-700 " +
                                  "dark:text-amber-500"
                                }
                              >
                                {t("accessBuilder.directGrant", "Granted to this member only")}
                              </span>
                              <button
                                type="button"
                                onClick={() => onChange({ [p.key]: false } as Partial<AccessDraft>)}
                                className={
                                  "ml-1.5 text-[10px] font-medium text-muted-foreground underline " +
                                  "underline-offset-2 hover:text-foreground"
                                }
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
                ? t(
                    "accessBuilder.directGrantHint",
                    "Highlighted permissions were granted to this member directly, not by the " +
                      "role. They can be removed here but not added — put them on a role " +
                      "instead, so it is visible who holds them.",
                  )
                : t(
                    "accessBuilder.fromRoleHint",
                    "Change these on the role itself — they apply to everyone who holds it.",
                  )}
            </p>
          </div>
        )}

        {/* Task creation SCOPE is a per-member setting, not a permission: it
            narrows where this person may create, once the role lets them. */}
        {(value.systemRole === "ADMIN" ||
          selectedRole?.permissions?.canCreateTasks === true ||
          value.canCreateTasks) && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("accessBuilder.taskScope.title", "Where they can create tasks")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("accessBuilder.taskScope.desc", "Narrows task creation for this member only.")}
              </p>
            </div>
            <Select value={value.taskCreationScope} onValueChange={(v) => onChange({ taskCreationScope: v })}>
              <SelectTrigger className="h-8 w-[190px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_SCOPES.map((sc) => (
                  <SelectItem key={sc.key} value={sc.key} className="text-xs">
                    {t(sc.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </Field>
  )
}
