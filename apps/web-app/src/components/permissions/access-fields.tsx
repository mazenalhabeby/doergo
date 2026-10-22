"use client"

import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { MessageCircle } from "lucide-react"
import { moduleAllowedForExternal } from "@hbcfield/shared/client"
import type { MobileModule } from "@hbcfield/shared/client"
import { organizationsApi } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Field } from "./access-field"
import { FEATURE_TABS, PLATFORMS, SCOPES } from "./access-field-options"
import type { AccessFieldsProps } from "./access-field-types"
import { AccessRoleField } from "./access-role-field"
import { AccessPermissionsSection } from "./access-permissions-section"
import { AccessContactSection } from "./access-contact-section"
import { ChoiceChip } from "@/components/ui/choice-chip"
export { Field } from "./access-field"
export type { AccessFieldsProps } from "./access-field-types"

/**
 * AccessFields — the controlled, presentational editor for every access value
 * (platform, permissions, feature tabs, attendance, space scope, messaging,
 * contact scope, management directory & reports). Owns NO persistence and NO
 * member-specific concerns (Save button, notification watchers): those live in
 * the caller. This single component powers BOTH the member Access Builder and
 * the invitation pre-config, so the two can never drift.
 */
export function AccessFields({
  value,
  onChange,
  excludeContactId,
  showRole = true,
  lockRole = false,
  allowAdmin = true,
  roleOnly = false,
  external = false,
}: AccessFieldsProps) {
  const { t } = useTranslation()

  // Org-wide roles (Admin / Manager / custom) for the role selector.
  const { data: orgRoles } = useQuery({
    queryKey: keys.organization.roles(),
    queryFn: () => organizationsApi.getRoles(),
    staleTime: 60000,
  })
  // Only EMPLOYEE-assignable roles (Admin is its own top option).
  const assignableRoles = (orgRoles || []).filter((r) => r.slug !== "admin")
  const selectedRole = assignableRoles.find((r) => r.id === value.memberRoleId)

  /** Does this member hold canViewAllTasks — the permission the space list is
   *  scoped against — from either their role or a direct grant? */
  const seesAllSpacesAnyway =
    value.systemRole === "ADMIN" ||
    selectedRole?.permissions?.canViewAllTasks === true ||
    value.canViewAllTasks === true

  const toggleModule = (m: MobileModule) =>
    onChange({
      modules: value.modules.includes(m) ? value.modules.filter((x) => x !== m) : [...value.modules, m],
    })

  // Not for an external member: the server refuses an org-wide role for one, so
  // the selector would be a control whose value is discarded.
  const roleField =
    showRole && !external ? (
      <AccessRoleField
        value={value}
        onChange={onChange}
        lockRole={lockRole}
        allowAdmin={allowAdmin}
        assignableRoles={assignableRoles}
      />
    ) : null

  if (roleOnly) return <div className="space-y-6">{roleField}</div>

  return (
    <div className="space-y-6">
      {roleField}

      {/* Platform */}
      <Field dataTour="access-platform" label={t("accessBuilder.platformAccess")}>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ platforms: p.key })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                value.platforms === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <p.icon className="h-3.5 w-3.5" />
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </Field>

      {/*
        Permissions — read-only. Every capability comes from the assigned role;
        this section reports what that means rather than offering a second place
        to set it. See LEGACY_DIRECT_KEYS for why per-member switches went away.
      */}
      {!external && <AccessPermissionsSection value={value} onChange={onChange} selectedRole={selectedRole} />}

      {/*
        Feature tabs.

        For an external member the list is only what they can actually hold.
        Clock and Time off describe an EMPLOYMENT — hours we owe payment for,
        leave asked of us — so the server strips them on save; offering them
        produced a toggle that lit up, saved "successfully", and was off again
        when the page came back. Shown disabled with a reason first, then
        removed outright: they are never usable for this person, and a
        permanently dead control is clutter on a panel that is read often.

        Filtered through the same helper the save enforces, so allowing one of
        them to external members later needs no change here.
      */}
      <Field dataTour="access-features" label={t("accessBuilder.featureTabsLabel")}>
        <div className="flex flex-wrap gap-2">
          {FEATURE_TABS.filter((m) => !external || moduleAllowedForExternal(m.key)).map((m) => {
            const on = value.modules.includes(m.key)
            return (
              <ChoiceChip key={m.key} type="button" variant="iconPill" on={on} onClick={() => toggleModule(m.key)}>
                {t(m.labelKey)} {on ? "✓" : ""}
              </ChoiceChip>
            )
          })}
        </div>
      </Field>

      {/* Attendance — remote clock-in. Always shown; disabled with a hint when
          the Clock module is off (remote clock-in needs clock access). */}
      {!external && (
        <Field dataTour="access-attendance" label={t("accessBuilder.attendance", "Attendance")}>
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border border-border px-4 py-3",
              !value.modules.includes("clock") && "opacity-70",
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("members.memberEditor.allowRemote", "Allow remote clock-in")}
              </p>
              <p className="text-xs text-muted-foreground">
                {value.modules.includes("clock")
                  ? t(
                      "members.memberEditor.allowRemoteHint",
                      "Can clock in from anywhere (WFH/on the road) without a site geofence. " +
                        "Location is still captured.",
                    )
                  : t("accessBuilder.allowRemoteNeedsClock", "Enable the Clock module above to use remote clock-in.")}
              </p>
            </div>
            <Switch
              checked={value.allowRemote}
              onCheckedChange={(v) => onChange({ allowRemote: v })}
              disabled={!value.modules.includes("clock")}
            />
          </div>
        </Field>
      )}

      {/* Space scope */}
      {!external && (
        <Field dataTour="access-spaces" label={t("accessBuilder.spaceVisibility")}>
          <div className="space-y-2">
            {/* "View all tasks" is what the space list is scoped against, so a
              member who holds it sees every workspace whatever is picked here.
              Saying so beats leaving an admin to set a restriction that never
              takes effect. */}
            {seesAllSpacesAnyway && (
              <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-500">
                {t(
                  "accessBuilder.spaceVisibilityOverridden",
                  "This member can view all tasks, so they see every workspace regardless " +
                    "of the choice below. Remove that permission from their role to make this " +
                    "take effect.",
                )}
              </p>
            )}
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onChange({ spaceScope: s.key })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  value.spaceScope === s.key ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                    value.spaceScope === s.key ? "border-primary bg-primary" : "border-muted-foreground/40",
                  )}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{t(s.labelKey)}</span>
                  <span className="block text-xs text-muted-foreground">{t(s.descKey)}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Messaging — ONE symmetric switch: being able to reach teammates and
          being reachable by them are the same capability. Drives both
          canContact (outbound) and contactable (inbound) together. */}
      <Field dataTour="access-collaboration" label={t("accessBuilder.collaboration")}>
        <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("accessBuilder.contact.title")}</p>
              <p className="text-xs text-muted-foreground">{t("accessBuilder.contact.desc")}</p>
            </div>
          </div>
          <Switch
            checked={value.canContact && value.contactable}
            onCheckedChange={(v) => onChange({ canContact: v, contactable: v })}
          />
        </div>
      </Field>

      {/* Contact management — a SEPARATE control: scopes WHO this member may
          reach (No one / All / Specific). Independent of the on/off above. */}
      <AccessContactSection value={value} onChange={onChange} excludeContactId={excludeContactId} />
    </div>
  )
}
