"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Smartphone, Monitor, Layers, MessageCircle, Check } from "lucide-react"
import { organizationsApi } from "@/lib/api"
import { personName, ACCESS_PERMISSION_SCHEMA, moduleAllowedForExternal } from "@hbcfield/shared/client"
import type { AccessDraft, MobileModule, SpaceScope, AccessPlatform } from "@hbcfield/shared/client"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/user-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAccessFields, Field } from "./use-access-fields"
import { FEATURE_TABS, PLATFORMS, SCOPES, TASK_SCOPES } from "./access-fields-helpers"
import { AccessFieldsPermissions } from "./access-fields-permissions"
import { AccessFieldsContactAccess } from "./access-fields-contact-access"
export { Field } from "./use-access-fields"

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
}: {
  value: AccessDraft
  /** Emit a partial patch; the parent owns the draft. */
  onChange: (patch: Partial<AccessDraft>) => void
  /** Member id to hide from the "Specific contacts" picker (omit when inviting). */
  excludeContactId?: string
  /** Show the Role selector (member edit + invite). */
  showRole?: boolean
  /** Lock the Role selector (editing your own row — can't change your own role). */
  lockRole?: boolean
  /** Render ONLY the role selector — for an admin, whose permissions are fixed. */
  roleOnly?: boolean
  /** Offer the Admin option (member edit). Invites can't create admins → false. */
  allowAdmin?: boolean
  /**
   * This person works for a client or partner. Shows only what shapes their
   * SCREENS — where they log in, and which tabs they get.
   *
   * The four sections dropped are not hidden for tidiness, they are sections
   * that cannot mean anything here: the org Role is refused by the server, the
   * Permissions readout is derived from that role and so reads "grants no
   * permissions yet" for everybody external, remote clock-in belongs to
   * somebody who clocks in, and space visibility is settled by their single
   * assignment. A control that cannot take effect is worse than an absent one
   * — somebody sets it and waits for something to happen.
   *
   * Their actual powers come from the role they are given IN a space.
   */
  external?: boolean
}) {
  const vm = useAccessFields({ value, onChange, excludeContactId, showRole, lockRole, allowAdmin, roleOnly, external })
  const {
    t,
    candidateContacts,
    selectedRole,
    permView,
    seesAllSpacesAnyway,
    toggleModule,
    roleField,
  } = vm

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
                value.platforms === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
      <AccessFieldsPermissions vm={vm} external={external} value={value} onChange={onChange} />

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
              <button
                key={m.key}
                type="button"
                onClick={() => toggleModule(m.key)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(m.labelKey)} {on ? "✓" : ""}
              </button>
            )
          })}
        </div>
      </Field>

      {/* Attendance — remote clock-in. Always shown; disabled with a hint when
          the Clock module is off (remote clock-in needs clock access). */}
      {!external && (
      <Field dataTour="access-attendance" label={t("accessBuilder.attendance", "Attendance")}>
        <div className={cn(
          "flex items-center justify-between rounded-xl border border-border px-4 py-3",
          !value.modules.includes("clock") && "opacity-70",
        )}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("members.memberEditor.allowRemote", "Allow remote clock-in")}</p>
            <p className="text-xs text-muted-foreground">
              {value.modules.includes("clock")
                ? t(
                  "members.memberEditor.allowRemoteHint",
                  ("Can clock in from anywhere (WFH/on the road) without a site geofence. " + "Location is still captured."))
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
                ("This member can view all tasks, so they see every workspace regardless " +
                  "of the choice below. Remove that permission from their role to make this " +
                  "take effect."),
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
              <span className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                value.spaceScope === s.key ? "border-primary bg-primary" : "border-muted-foreground/40",
              )} />
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
      <AccessFieldsContactAccess vm={vm} value={value} onChange={onChange} />
    </div>
  )
}
