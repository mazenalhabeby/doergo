"use client"

import { useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Smartphone, Monitor, Layers, MessageCircle, Check } from "lucide-react"
import { organizationsApi } from "@/lib/api"
import { ACCESS_PERMISSION_SCHEMA } from "@hbcfield/shared/client"
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

// Feature tabs only — `create_task` and `manage` are NOT stored here; they
// derive from the Create / Manage permissions below (single source of truth).
const FEATURE_TABS: { key: MobileModule; labelKey: string }[] = [
  { key: "tasks", labelKey: "accessBuilder.featureTabs.tasks" },
  { key: "clock", labelKey: "accessBuilder.featureTabs.clock" },
  { key: "time_off", labelKey: "accessBuilder.featureTabs.timeOff" },
]

const PLATFORMS: { key: AccessPlatform; labelKey: string; icon: typeof Monitor }[] = [
  { key: "web", labelKey: "accessBuilder.platforms.webOnly", icon: Monitor },
  { key: "mobile", labelKey: "accessBuilder.platforms.mobileOnly", icon: Smartphone },
  { key: "both", labelKey: "accessBuilder.platforms.both", icon: Layers },
]

const SCOPES: { key: SpaceScope; labelKey: string; descKey: string }[] = [
  { key: "own", labelKey: "accessBuilder.scopes.own.label", descKey: "accessBuilder.scopes.own.desc" },
  { key: "tasks", labelKey: "accessBuilder.scopes.tasks.label", descKey: "accessBuilder.scopes.tasks.desc" },
  { key: "all", labelKey: "accessBuilder.scopes.all.label", descKey: "accessBuilder.scopes.all.desc" },
]

const TASK_SCOPES = [
  { key: "SELF", labelKey: "accessBuilder.taskScopes.self" },
  { key: "SPACE", labelKey: "accessBuilder.taskScopes.space" },
  { key: "ORG", labelKey: "accessBuilder.taskScopes.org" },
]

// Permission key → short label (for the "Grants: …" role summary line).
const ORG_PERM_LABEL: Record<string, string> = Object.fromEntries(
  ACCESS_PERMISSION_SCHEMA.map((p) => [p.key, p.label]),
)

/**
 * The five permissions this editor can toggle directly — they are columns on the
 * member. Everything else in the catalogue is granted by the assigned ROLE and is
 * shown here read-only, attributed, so this screen answers "what can this person
 * do?" completely instead of answering a third of it and staying silent about the
 * rest.
 *
 * They are deliberately NOT made editable per member. The union of a member flag
 * and a role grant cannot say no — the codebase already carries that scar — so a
 * per-member override could only ever widen, never restrict, and "why can this
 * person still approve overtime?" would have two places to look instead of one.
 */
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
const LEGACY_DIRECT_KEYS = [
  "canCreateTasks", "canAssignTasks", "canViewAllTasks", "canManageUsers", "canViewReports",
] as const

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
  /** Offer the Admin option (member edit). Invites can't create admins → false. */
  allowAdmin?: boolean
}) {
  const { t } = useTranslation()

  // Contacts this member could be allowed to reach: leadership only — admins and
  // managers. "Manager" = holds an elevated permission (view-all / assign tasks /
  // manage users). NOT merely "has a named role": in the unified role system every
  // member has a role, so `!!memberRole` would match plain employees (Technician,
  // Maintenance Worker) too — we want only actual admins/managers here.
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", "accessContacts"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60000,
  })
  /*
    Who may be picked as a specific contact: admins and managers only.

    "Manager" is exactly what the chat rule means by it — ADMIN or
    canManageUsers — so the list offers the same people canReach already treats
    as always-reachable. It previously also admitted canViewAllTasks and
    canAssignTasks holders, which is most of a dispatch team, so "Specific
    contacts" listed nearly everyone and read like a directory.

    Anyone ALREADY on the allow-list stays listed even if they no longer
    qualify, captured once on mount so a row cannot vanish under the cursor
    while it is being unticked. Dropping them from the list would not remove
    the grant — it is still saved and still enforced — it would only hide it.
  */
  const initiallyAllowed = useRef<Set<string>>(new Set(value.contactAllowedIds))
  const candidateContacts = useMemo(
    () =>
      (membersData?.data || []).filter(
        (m) =>
          m.id !== excludeContactId &&
          m.isActive &&
          (m.role === "ADMIN" || m.canManageUsers || initiallyAllowed.current.has(m.id)),
      ),
    [membersData, excludeContactId],
  )

  // Org-wide roles (Admin / Manager / custom) for the role selector.
  const { data: orgRoles } = useQuery({
    queryKey: ["orgAccessRoles"],
    queryFn: () => organizationsApi.getRoles(),
    staleTime: 60000,
  })
  // Current selector value: "admin" (system), a role id, or "member" (no role).
  const ADMIN = "__admin__"
  const MEMBER = "__member__"
  const roleValue = value.systemRole === "ADMIN" ? ADMIN : (value.memberRoleId ?? MEMBER)
  // Only EMPLOYEE-assignable roles (Admin is its own top option).
  const assignableRoles = (orgRoles || []).filter((r) => r.slug !== "admin")
  const selectedRole = assignableRoles.find((r) => r.id === value.memberRoleId)
  const rolePerms = value.systemRole === "ADMIN"
    ? [t("accessBuilder.fullAccess", "Full access")]
    : selectedRole?.permissions
    ? Object.entries(selectedRole.permissions).filter(([, v]) => v === true).map(([k]) => ORG_PERM_LABEL[k] || k)
    : []

  /**
   * Every permission this member effectively holds, grouped by domain and
   * attributed to where it comes from — the role, or a direct grant on the
   * member. Admin holds the whole catalogue, so show it rather than an empty
   * box: "Admin" saying nothing about overtime or clients is exactly the
   * silence this block exists to remove.
   */
  const permView = useMemo(() => {
    const isAdmin = value.systemRole === "ADMIN"
    const direct = new Set(
      LEGACY_DIRECT_KEYS.filter((k) => value[k] === true),
    )
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

  /** Does this member hold canViewAllTasks — the permission the space list is
   *  scoped against — from either their role or a direct grant? */
  const seesAllSpacesAnyway =
    value.systemRole === "ADMIN" ||
    selectedRole?.permissions?.canViewAllTasks === true ||
    value.canViewAllTasks === true

  const toggleModule = (m: MobileModule) =>
    onChange({
      modules: value.modules.includes(m)
        ? value.modules.filter((x) => x !== m)
        : [...value.modules, m],
    })

  return (
    <div className="space-y-6">
      {/* Role — ONE selector: Admin (org owner), a named role (Manager/custom
          grants a permission preset org-wide), or Member (no named role). This is
          the single home for a member's role; the profile editor has none. */}
      {showRole && (
      <Field dataTour="access-role" label={t("accessBuilder.orgRole", "Role")}>
        <Select
          value={roleValue}
          disabled={lockRole}
          onValueChange={(v) => {
            if (v === ADMIN) onChange({ systemRole: "ADMIN" })
            else if (v === MEMBER) onChange({ systemRole: "EMPLOYEE", memberRoleId: null })
            else onChange({ systemRole: "EMPLOYEE", memberRoleId: v })
          }}
        >
          <SelectTrigger className="h-9 w-full max-w-sm text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowAdmin && (
              <SelectItem value={ADMIN} className="text-sm">{t("members.roles.admin", "Admin")}</SelectItem>
            )}
            {assignableRoles.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-sm">{r.name}</SelectItem>
            ))}
            <SelectItem value={MEMBER} className="text-sm">{t("accessBuilder.roleMember", "Member")}</SelectItem>
          </SelectContent>
        </Select>
        {lockRole ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{t("members.memberEditor.cantChangeOwnRole", "You can't change your own role.")}</p>
        ) : null}
      </Field>
      )}

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

      {/* Feature tabs */}
      <Field dataTour="access-features" label={t("accessBuilder.featureTabsLabel")}>
        <div className="flex flex-wrap gap-2">
          {FEATURE_TABS.map((m) => {
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
      <Field dataTour="access-attendance" label={t("accessBuilder.attendance", "Attendance")}>
        <div className={cn(
          "flex items-center justify-between rounded-xl border border-border px-4 py-3",
          !value.modules.includes("clock") && "opacity-70",
        )}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("members.memberEditor.allowRemote", "Allow remote clock-in")}</p>
            <p className="text-xs text-muted-foreground">
              {value.modules.includes("clock")
                ? t("members.memberEditor.allowRemoteHint", "Can clock in from anywhere (WFH/on the road) without a site geofence. Location is still captured.")
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

      {/* Space scope */}
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
                "This member can view all tasks, so they see every workspace regardless of the choice below. Remove that permission from their role to make this take effect.",
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
      <Field dataTour="access-contact" label={t("accessBuilder.contactAccess", "Contact access")}>
        <div className="space-y-2">
          <div className="space-y-2.5 rounded-xl border border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("accessBuilder.canContact.title", "Can contact")}</p>
                <p className="text-xs text-muted-foreground">{t("accessBuilder.canContact.desc", "Who this member may reach. Open to all teammates by default; restrict to specific people if needed.")}</p>
              </div>
              <Select value={value.contactScope} onValueChange={(v) => onChange({ contactScope: v })}>
                <SelectTrigger className="h-8 w-[168px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE" className="text-xs">{t("accessBuilder.contactScope.none", "Space contacts only")}</SelectItem>
                  <SelectItem value="ALL" className="text-xs">{t("accessBuilder.contactScope.all", "All contacts")}</SelectItem>
                  <SelectItem value="SELECTED" className="text-xs">{t("accessBuilder.contactScope.selected", "Specific contacts…")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.contactScope === "SELECTED" && (
              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
                {candidateContacts.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("accessBuilder.noContacts", "No contacts available")}</p>
                ) : (
                  candidateContacts.map((c) => {
                    const checked = value.contactAllowedIds.includes(c.id)
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            onChange({
                              contactAllowedIds: v
                                ? [...value.contactAllowedIds, c.id]
                                : value.contactAllowedIds.filter((id) => id !== c.id),
                            })
                          }
                        />
                        <UserAvatar firstName={c.firstName} lastName={c.lastName} avatarUrl={c.avatarUrl} seed={c.id} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{c.firstName} {c.lastName}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {c.role === "ADMIN"
                            ? t("members.roles.admin")
                            : c.canManageUsers
                            ? t("accessBuilder.contactManager", "Manager")
                            : /* on the list from before the rule narrowed */
                              t("accessBuilder.contactLegacyPick", "No longer a manager")}
                        </span>
                      </label>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </Field>
    </div>
  )
}


export function Field({ label, children, dataTour }: { label: string; children: React.ReactNode; dataTour?: string }) {
  return (
    <div data-tour={dataTour}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
