"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Save, Bell, ShieldCheck } from "lucide-react"
import { organizationsApi } from "@/lib/api"
import type { OrgMember } from "@/lib/api"
import { readAccessDraft, serializeAccessDraft } from "@hbcfield/shared/client"
import type { AccessDraft } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/user-avatar"
import { AccessFields, Field } from "@/components/access-fields"
import { notify } from "@/lib/toast"

/** Stable, order-insensitive canonical form of a draft's PERSISTED shape — so
 *  dirty tracking ignores field ordering and collapsed values (e.g. task scope
 *  when create is off). Reuses `serializeAccessDraft` (single source of truth). */
function canon(d: AccessDraft): string {
  const p = serializeAccessDraft(d)
  return JSON.stringify({
    ...p,
    systemRole: d.systemRole, // role tier isn't in the persisted shape — track it explicitly
    enabledModules: { ...p.enabledModules, modules: [...p.enabledModules.modules].sort() },
    contactAllowedIds: [...p.contactAllowedIds].sort(),
  })
}

/**
 * Access Builder — the single place to configure a member: reach (platform,
 * space visibility, collaboration), feature tabs, AND the enforced permissions
 * (create / assign / view-all / manage). Saving writes the Access Profile and
 * the permission fields together, so the navigation UI and the server-side
 * permission guard can never disagree. Field rendering is delegated to the
 * shared <AccessFields>, which also powers the invitation pre-config.
 */
export function AccessBuilder({
  member,
  onSaved,
  applyToIds,
  bulkCount,
}: {
  member: OrgMember
  onSaved?: () => void
  /** Bulk mode: apply the SAME access values to every id here (member is the template/seed). */
  applyToIds?: string[]
  /** How many members the bulk apply will affect (for labels). */
  bulkCount?: number
}) {
  const isBulk = Array.isArray(applyToIds) && applyToIds.length > 0
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  // Editing your own row — you can't change your own role (backend rejects it).
  const isSelf = !isBulk && currentUser?.id === member.id

  const initial = useMemo(() => readAccessDraft(member), [member])
  const [draft, setDraft] = useState<AccessDraft>(initial)
  const patch = (p: Partial<AccessDraft>) => setDraft((cur) => ({ ...cur, ...p }))
  const [saving, setSaving] = useState(false)

  // Re-seed when the member (or bulk template) changes.
  useEffect(() => { setDraft(initial) }, [initial])

  // ── Notification watchers (who is alerted ABOUT this member) ────────────────
  // Persisted together with the access on Save — NOT per-toggle. In bulk mode we
  // apply the same watcher set to every selected member (only when touched, so an
  // untouched Save never wipes existing watchers).
  const [watcherIds, setWatcherIds] = useState<Set<string>>(new Set())
  const [watchersTouched, setWatchersTouched] = useState(false)
  const { data: watchersData } = useQuery({
    queryKey: ["memberWatchers", member.id],
    queryFn: () => organizationsApi.getMemberWatchers(member.id),
    enabled: !isBulk,
  })
  useEffect(() => {
    if (!isBulk) { setWatcherIds(new Set((watchersData || []).map((w) => w.id))); setWatchersTouched(false) }
  }, [watchersData, isBulk])
  const toggleWatcher = (id: string) => {
    setWatchersTouched(true)
    setWatcherIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Eligible watchers = admins + Show-in-Management members. In single mode
  // exclude the member itself; in bulk keep all (the backend drops self per-subject).
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", "positions"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60000,
  })
  const watcherCandidates = useMemo(
    () => (membersData?.data || []).filter(
      (m) => (isBulk || m.id !== member.id) && m.isActive && (m.role === "ADMIN" || m.canViewAllTasks || !!m.memberRole),
    ),
    [membersData, member.id, isBulk],
  )

  const dirty = canon(draft) !== canon(initial) || watchersTouched

  const save = async () => {
    try {
      setSaving(true)
      const payload: Record<string, unknown> = { ...serializeAccessDraft(draft) }
      // The Role selector can promote/demote the system tier. Send `role` ONLY
      // when it actually changed (and never for your own row — the backend
      // rejects a self role change) so we don't clobber permissions or trip the
      // last-admin / self guards on an ordinary access edit.
      if (!isBulk && !isSelf && draft.systemRole !== initial.systemRole) {
        payload.role = draft.systemRole
      }
      // Bulk: apply the same access to every selected member. Single: just this one.
      const targetIds = isBulk ? (applyToIds as string[]) : [member.id]
      await Promise.all(targetIds.map((id) => organizationsApi.updateMember(id, payload)))
      // Persist notification watchers together with the access — only when the
      // admin actually touched them, so an untouched Save never clears them.
      if (watchersTouched) {
        const ids = [...watcherIds]
        await Promise.all(targetIds.map((id) => organizationsApi.setMemberWatchers(id, ids)))
      }
      if (isBulk) {
        notify.success(t("accessBuilder.accessUpdated"), t("accessBuilder.bulkAppliedDesc", "Access applied to {{count}} members", { count: targetIds.length }))
      } else {
        notify.success(t("accessBuilder.accessUpdated"), t("accessBuilder.accessUpdatedDesc", { name: member.firstName }))
      }
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
          <p className="text-xs text-muted-foreground">
            {isBulk
              ? t("accessBuilder.bulkSubtitle", "Applies these access values to {{count}} selected members.", { count: bulkCount ?? applyToIds!.length })
              : t("accessBuilder.subtitle", { name: member.firstName })}
          </p>
        </div>
        <Button data-tour="access-save" size="sm" className="gap-1.5" disabled={saving || (!isBulk && !dirty)} onClick={save}>
          <Save className="h-3.5 w-3.5" />
          {saving ? t("common.saving") : (isBulk ? t("accessBuilder.applyToAll", "Apply to all") : t("common.save"))}
        </Button>
      </div>

      <div className="p-5 space-y-6">
        {/* Admins have full access by definition — there are no access choices to
            make (every permission + module is granted, remote clock-in included).
            Show a clear "full access" note instead of the granular editor. The
            watchers section below still applies (who is alerted about this admin). */}
        {!isBulk && member.role === "ADMIN" ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("accessBuilder.adminFullAccess", "Full access")}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(
                  "accessBuilder.adminFullAccessDesc",
                  "Admins have every permission and module across the whole organization — including remote clock-in. There's nothing to configure here.",
                )}
              </p>
            </div>
          </div>
        ) : (
          <AccessFields
            value={draft}
            onChange={patch}
            excludeContactId={isBulk ? undefined : member.id}
            showRole={!isBulk}
            lockRole={isSelf}
          />
        )}

        {/* Notifications about — who is alerted ABOUT this member (approvals,
            geofence, …). Selection is held locally and persisted on Save/Apply,
            NOT per-toggle. Empty = default routing (org admins + space managers). */}
        <Field dataTour="access-watchers" label={t("members.watchers.title", "Notifications about {{name}}", { name: isBulk ? t("accessBuilder.selectedMembers", "selected members") : member.firstName })}>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border/60">
              <Bell className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {t("members.watchers.hint", "Choose who is alerted about this member (approvals, geofence, …). If no one is selected, it defaults to org admins and this member's space managers.")}
              </p>
            </div>
            {watcherCandidates.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("members.watchers.noManagers", "No admins or managers to assign yet.")}
              </p>
            ) : (
              <div className="max-h-56 overflow-auto divide-y divide-border/40">
                {watcherCandidates.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors">
                    <Checkbox checked={watcherIds.has(m.id)} onCheckedChange={() => toggleWatcher(m.id)} />
                    <UserAvatar firstName={m.firstName} lastName={m.lastName} avatarUrl={m.avatarUrl} seed={m.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.role === "ADMIN" ? t("members.roles.admin", "Admin") : t("roles.manager", "Manager")}
                        {m.email ? ` · ${m.email}` : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )
}
