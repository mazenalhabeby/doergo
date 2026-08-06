"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Smartphone, Monitor, Layers, MessageCircle } from "lucide-react"
import { organizationsApi } from "@/lib/api"
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
  lockManagementForAdmin = false,
}: {
  value: AccessDraft
  /** Emit a partial patch; the parent owns the draft. */
  onChange: (patch: Partial<AccessDraft>) => void
  /** Member id to hide from the "Specific contacts" picker (omit when inviting). */
  excludeContactId?: string
  /** Force Show-in-Management ON + disabled (editing an actual ADMIN member). */
  lockManagementForAdmin?: boolean
}) {
  const { t } = useTranslation()

  // Contacts this member could be allowed to reach: ONLY admins + members flagged
  // "Show in Management" (chat is open-by-default, so contactable alone is not it).
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", "accessContacts"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60000,
  })
  const candidateContacts = useMemo(
    () =>
      (membersData?.data || []).filter(
        (m) => m.id !== excludeContactId && m.isActive && (m.role === "ADMIN" || m.showInManagement),
      ),
    [membersData, excludeContactId],
  )

  const showManagement = value.showInManagement || lockManagementForAdmin

  const toggleModule = (m: MobileModule) =>
    onChange({
      modules: value.modules.includes(m)
        ? value.modules.filter((x) => x !== m)
        : [...value.modules, m],
    })

  return (
    <div className="space-y-6">
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

      {/* Permissions — the enforced authorization toggles */}
      <Field dataTour="access-permissions" label={t("accessBuilder.permissions")}>
        <div className="space-y-2">
          <PermissionRow
            title={t("accessBuilder.perms.create.title")}
            desc={t("accessBuilder.perms.create.desc")}
            checked={value.canCreateTasks}
            onChange={(v) => onChange({ canCreateTasks: v })}
          >
            {value.canCreateTasks && (
              <Select value={value.taskCreationScope} onValueChange={(v) => onChange({ taskCreationScope: v })}>
                <SelectTrigger className="h-8 w-[190px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_SCOPES.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-xs">
                      {t(s.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </PermissionRow>
          <PermissionRow
            title={t("accessBuilder.perms.assign.title")}
            desc={t("accessBuilder.perms.assign.desc")}
            checked={value.canAssignTasks}
            onChange={(v) => onChange({ canAssignTasks: v })}
          />
          <PermissionRow
            title={t("accessBuilder.perms.viewAll.title")}
            desc={t("accessBuilder.perms.viewAll.desc")}
            checked={value.canViewAllTasks}
            onChange={(v) => onChange({ canViewAllTasks: v })}
          />
          <PermissionRow
            title={t("accessBuilder.perms.manage.title")}
            desc={t("accessBuilder.perms.manage.desc")}
            checked={value.canManageUsers}
            onChange={(v) => onChange({ canManageUsers: v })}
          />
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
                  <SelectItem value="NONE" className="text-xs">{t("accessBuilder.contactScope.none", "No one")}</SelectItem>
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
                          {c.role === "ADMIN" ? t("members.roles.admin") : (c.position || t("accessBuilder.contactLabel", "Contact"))}
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

      {/* Show in Management — SEPARATE from chat: lists this member in the org
          Management directory (reach leadership). Own field `showInManagement`.
          A single admin is always shown (toggle locked ON). */}
      <Field dataTour="access-management" label={t("accessBuilder.managementLabel", "Management directory")}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("members.memberEditor.showInManagement", "Show in Management")}</p>
              <p className="text-xs text-muted-foreground">
                {lockManagementForAdmin
                  ? t("members.memberEditor.showInManagementAdmin", "Admins always appear in the Management directory.")
                  : t("members.memberEditor.showInManagementHint", "Lists this person (with their sub-role) so teammates can reach them from anywhere.")}
              </p>
            </div>
            <Switch
              checked={showManagement}
              disabled={lockManagementForAdmin}
              onCheckedChange={(v) => onChange({ showInManagement: v })}
            />
          </div>
          {/* Reports access — only offered to Management members. */}
          {showManagement && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("accessBuilder.canViewReports.title", "Allow reports")}</p>
                <p className="text-xs text-muted-foreground">{t("accessBuilder.canViewReports.desc", "Let this member build and run reports.")}</p>
              </div>
              <Switch
                checked={lockManagementForAdmin ? true : value.canViewReports}
                disabled={lockManagementForAdmin}
                onCheckedChange={(v) => onChange({ canViewReports: v })}
              />
            </div>
          )}
        </div>
      </Field>
    </div>
  )
}

export function PermissionRow({
  title,
  desc,
  checked,
  onChange,
  children,
}: {
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {children}
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
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
