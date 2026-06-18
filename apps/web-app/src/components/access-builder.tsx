"use client"

import { useMemo, useState } from "react"
import { Smartphone, Monitor, Layers, MessageCircle, Save } from "lucide-react"
import { organizationsApi } from "@/lib/api"
import type { OrgMember } from "@/lib/api"
import { getModules, getSpaceScope, getAccessPlatforms, canContactColleagues } from "@hbcfield/shared/client"
import type { MobileModule, SpaceScope, AccessPlatform } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
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
const FEATURE_TABS: { key: MobileModule; label: string }[] = [
  { key: "tasks", label: "Tasks" },
  { key: "clock", label: "Clock" },
  { key: "time_off", label: "Time Off" },
]

const PLATFORMS: { key: AccessPlatform; label: string; icon: typeof Monitor }[] = [
  { key: "web", label: "Web only", icon: Monitor },
  { key: "mobile", label: "Mobile only", icon: Smartphone },
  { key: "both", label: "Both", icon: Layers },
]

const SCOPES: { key: SpaceScope; label: string; desc: string }[] = [
  { key: "own", label: "My spaces only", desc: "Sees only the spaces they're assigned to." },
  { key: "tasks", label: "Tasks only", desc: "No space view — just their own task list." },
  { key: "all", label: "All spaces", desc: "Read-only overview of every space." },
]

const TASK_SCOPES = [
  { key: "SELF", label: "Their own tasks" },
  { key: "SPACE", label: "Tasks in their spaces" },
  { key: "ORG", label: "Any task in the org" },
]

/**
 * Access Builder — the single place to configure a member: reach (platform,
 * space visibility, collaboration), feature tabs, AND the enforced permissions
 * (create / assign / view-all / manage). Saving writes the Access Profile and
 * the permission fields together, so the navigation UI and the server-side
 * permission guard can never disagree.
 */
export function AccessBuilder({ member, onSaved }: { member: OrgMember; onSaved?: () => void }) {
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
  const [saving, setSaving] = useState(false)

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
    canManageUsers !== initial.canManageUsers

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
      })
      notify.success("Access updated", `${member.firstName}'s apps will update on next sign-in.`)
      onSaved?.()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't update access")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Access</h3>
          <p className="text-xs text-muted-foreground">What {member.firstName} can do &amp; see on web &amp; mobile.</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled={!dirty || saving} onClick={save}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="p-5 space-y-6">
        {/* Platform */}
        <Field label="Platform access">
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
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Permissions — the enforced authorization toggles */}
        <Field label="Permissions">
          <div className="space-y-2">
            <PermissionRow
              title="Create tasks"
              desc="Open new tasks."
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
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </PermissionRow>
            <PermissionRow
              title="Assign tasks"
              desc="Assign tasks to other people."
              checked={canAssignTasks}
              onChange={setCanAssignTasks}
            />
            <PermissionRow
              title="View all tasks"
              desc="See every task in the organization, not just their own."
              checked={canViewAllTasks}
              onChange={setCanViewAllTasks}
            />
            <PermissionRow
              title="Manage members"
              desc="Invite, edit and remove people. Opens the Manage hub."
              checked={canManageUsers}
              onChange={setCanManageUsers}
            />
          </div>
        </Field>

        {/* Feature tabs */}
        <Field label="Feature tabs">
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
                  {m.label} {on ? "✓" : ""}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Space scope */}
        <Field label="Space visibility">
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
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* Collaboration */}
        <Field label="Collaboration">
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Can contact colleagues</p>
                <p className="text-xs text-muted-foreground">Message &amp; call teammates in their visible spaces.</p>
              </div>
            </div>
            <Switch checked={canContact} onCheckedChange={setCanContact} />
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
