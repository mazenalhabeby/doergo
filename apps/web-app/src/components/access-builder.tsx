"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Smartphone, Monitor, Layers, MessageCircle, Save } from "lucide-react"
import { organizationsApi } from "@/lib/api"
import type { OrgMember } from "@/lib/api"
import { getModules, getSpaceScope, getAccessPlatforms, canContactColleagues } from "@hbcfield/shared/client"
import type { MobileModule, SpaceScope, AccessPlatform } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
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
import { notify } from "@/lib/toast"

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
 * Access Builder — the single place to configure a member: reach (platform,
 * space visibility, collaboration), feature tabs, AND the enforced permissions
 * (create / assign / view-all / manage). Saving writes the Access Profile and
 * the permission fields together, so the navigation UI and the server-side
 * permission guard can never disagree.
 */
export function AccessBuilder({ member, onSaved }: { member: OrgMember; onSaved?: () => void }) {
  const { t } = useTranslation()
  const initial = useMemo(() => ({
    modules: getModules(member as any).filter((m) =>
      FEATURE_TABS.some((t) => t.key === m),
    ),
    platforms: getAccessPlatforms(member as any),
    spaceScope: getSpaceScope(member as any),
    canContact: canContactColleagues(member as any),
    canCreateTasks: !!member.canCreateTasks,
    taskScope: (member.taskCreationScope as string) || "SELF",
    canAssignTasks: !!member.canAssignTasks,
    canViewAllTasks: !!member.canViewAllTasks,
    canManageUsers: !!member.canManageUsers,
    contactable: !!member.contactable,
    contactScope: member.contactScope || "NONE",
    contactAllowedIds: member.contactAllowedIds || [],
  }), [member])

  const [modules, setModules] = useState<MobileModule[]>(initial.modules)
  const [platforms, setPlatforms] = useState<AccessPlatform>(initial.platforms)
  const [spaceScope, setSpaceScope] = useState<SpaceScope>(initial.spaceScope)
  const [canContact, setCanContact] = useState<boolean>(initial.canContact)
  const [canCreateTasks, setCanCreateTasks] = useState<boolean>(initial.canCreateTasks)
  const [taskScope, setTaskScope] = useState<string>(
    initial.taskScope === "NONE" ? "SELF" : initial.taskScope,
  )
  const [canAssignTasks, setCanAssignTasks] = useState<boolean>(initial.canAssignTasks)
  const [canViewAllTasks, setCanViewAllTasks] = useState<boolean>(initial.canViewAllTasks)
  const [canManageUsers, setCanManageUsers] = useState<boolean>(initial.canManageUsers)
  const [contactable, setContactable] = useState<boolean>(initial.contactable)
  const [contactScope, setContactScope] = useState<string>(initial.contactScope)
  const [contactAllowedIds, setContactAllowedIds] = useState<string[]>(initial.contactAllowedIds)
  const [saving, setSaving] = useState(false)

  // Contacts directory this member could be allowed to reach: admins + contactable members.
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", "positions"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60000,
  })
  const candidateContacts = useMemo(
    () => (membersData?.data || []).filter(
      (m) => m.id !== member.id && m.isActive && (m.role === "ADMIN" || m.canViewAllTasks || m.contactable),
    ),
    [membersData, member.id],
  )

  const toggleModule = (m: MobileModule) =>
    setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))

  const dirty =
    JSON.stringify(modules.slice().sort()) !== JSON.stringify(initial.modules.slice().sort()) ||
    platforms !== initial.platforms ||
    spaceScope !== initial.spaceScope ||
    canContact !== initial.canContact ||
    canCreateTasks !== initial.canCreateTasks ||
    (canCreateTasks && taskScope !== initial.taskScope) ||
    canAssignTasks !== initial.canAssignTasks ||
    canViewAllTasks !== initial.canViewAllTasks ||
    canManageUsers !== initial.canManageUsers ||
    contactable !== initial.contactable ||
    contactScope !== initial.contactScope ||
    (contactScope === "SELECTED" && JSON.stringify(contactAllowedIds.slice().sort()) !== JSON.stringify(initial.contactAllowedIds.slice().sort()))

  const save = async () => {
    try {
      setSaving(true)
      await organizationsApi.updateMember(member.id, {
        enabledModules: { modules, platforms, spaceScope, canContact },
        canCreateTasks,
        taskCreationScope: canCreateTasks ? taskScope : "NONE",
        canAssignTasks,
        canViewAllTasks,
        canManageUsers,
        contactable,
        contactScope,
        contactAllowedIds: contactScope === "SELECTED" ? contactAllowedIds : [],
      })
      notify.success(t("accessBuilder.accessUpdated"), t("accessBuilder.accessUpdatedDesc", { name: member.firstName }))
      onSaved?.()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("accessBuilder.updateFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("accessBuilder.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("accessBuilder.subtitle", { name: member.firstName })}</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled={!dirty || saving} onClick={save}>
          <Save className="h-3.5 w-3.5" />
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>

      <div className="p-5 space-y-6">
        {/* Platform */}
        <Field label={t("accessBuilder.platformAccess")}>
          <div className="inline-flex rounded-lg bg-muted p-1">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPlatforms(p.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  platforms === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <p.icon className="h-3.5 w-3.5" />
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </Field>

        {/* Permissions — the enforced authorization toggles */}
        <Field label={t("accessBuilder.permissions")}>
          <div className="space-y-2">
            <PermissionRow
              title={t("accessBuilder.perms.create.title")}
              desc={t("accessBuilder.perms.create.desc")}
              checked={canCreateTasks}
              onChange={setCanCreateTasks}
            >
              {canCreateTasks && (
                <Select value={taskScope} onValueChange={setTaskScope}>
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
              checked={canAssignTasks}
              onChange={setCanAssignTasks}
            />
            <PermissionRow
              title={t("accessBuilder.perms.viewAll.title")}
              desc={t("accessBuilder.perms.viewAll.desc")}
              checked={canViewAllTasks}
              onChange={setCanViewAllTasks}
            />
            <PermissionRow
              title={t("accessBuilder.perms.manage.title")}
              desc={t("accessBuilder.perms.manage.desc")}
              checked={canManageUsers}
              onChange={setCanManageUsers}
            />
          </div>
        </Field>

        {/* Feature tabs */}
        <Field label={t("accessBuilder.featureTabsLabel")}>
          <div className="flex flex-wrap gap-2">
            {FEATURE_TABS.map((m) => {
              const on = modules.includes(m.key)
              return (
                <button
                  key={m.key}
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

        {/* Space scope */}
        <Field label={t("accessBuilder.spaceVisibility")}>
          <div className="space-y-2">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSpaceScope(s.key)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  spaceScope === s.key ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-accent/40",
                )}
              >
                <span className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
                  spaceScope === s.key ? "border-primary bg-primary" : "border-muted-foreground/40",
                )} />
                <span>
                  <span className="block text-sm font-medium text-foreground">{t(s.labelKey)}</span>
                  <span className="block text-xs text-muted-foreground">{t(s.descKey)}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* Collaboration */}
        <Field label={t("accessBuilder.collaboration")}>
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("accessBuilder.contact.title")}</p>
                <p className="text-xs text-muted-foreground">{t("accessBuilder.contact.desc")}</p>
              </div>
            </div>
            <Switch checked={canContact} onCheckedChange={setCanContact} />
          </div>
        </Field>

        {/* Contact access — who this member may reach in the contacts directory */}
        <Field label={t("accessBuilder.contactAccess", "Contact access")}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t("accessBuilder.contactable.title", "Contactable")}</p>
                <p className="text-xs text-muted-foreground">{t("accessBuilder.contactable.desc", "Appears in the contacts directory so teammates can reach them. Admins are always contactable.")}</p>
              </div>
              <Switch checked={contactable} onCheckedChange={setContactable} />
            </div>

            <div className="space-y-2.5 rounded-xl border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("accessBuilder.canContact.title", "Can contact")}</p>
                  <p className="text-xs text-muted-foreground">{t("accessBuilder.canContact.desc", "Which admins/contacts this member may reach. Secure by default.")}</p>
                </div>
                <Select value={contactScope} onValueChange={setContactScope}>
                  <SelectTrigger className="h-8 w-[168px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE" className="text-xs">{t("accessBuilder.contactScope.none", "No one")}</SelectItem>
                    <SelectItem value="ALL" className="text-xs">{t("accessBuilder.contactScope.all", "All contacts")}</SelectItem>
                    <SelectItem value="SELECTED" className="text-xs">{t("accessBuilder.contactScope.selected", "Specific contacts…")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contactScope === "SELECTED" && (
                <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
                  {candidateContacts.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("accessBuilder.noContacts", "No contacts available")}</p>
                  ) : (
                    candidateContacts.map((c) => {
                      const checked = contactAllowedIds.includes(c.id)
                      return (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => setContactAllowedIds((prev) => (v ? [...prev, c.id] : prev.filter((id) => id !== c.id)))}
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
      </div>
    </div>
  )
}

function PermissionRow({
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
