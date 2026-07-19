"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Bell } from "lucide-react"

import { organizationsApi, type OrgMember } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * Per-employee notification routing: choose which admins/managers get alerts
 * (approvals, geofence, …) ABOUT this member. Empty selection = the default
 * routing (org admins + the member's space managers).
 */
export function MemberWatchers({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  // Eligible watchers = ONLY admins + members flagged "Show in Management"
  // (leadership directory), excluding the member itself.
  const { data: membersResp } = useQuery({
    queryKey: ["orgMembers", "managers"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60_000,
  })
  const managers = useMemo(
    () =>
      ((membersResp?.data || []) as OrgMember[]).filter(
        (m) => m.id !== memberId && m.isActive && (m.role === "ADMIN" || m.showInManagement),
      ),
    [membersResp, memberId],
  )

  const { data: watchers = [] } = useQuery({
    queryKey: ["memberWatchers", memberId],
    queryFn: () => organizationsApi.getMemberWatchers(memberId),
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected(new Set(watchers.map((w) => w.id)))
  }, [watchers])

  const save = useMutation({
    mutationFn: (ids: string[]) => organizationsApi.setMemberWatchers(memberId, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberWatchers", memberId] })
      toast.success(t("members.watchers.saved", "Notification recipients updated"))
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
      // Revert optimistic state on failure.
      setSelected(new Set(watchers.map((w) => w.id)))
    },
  })

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    save.mutate([...next])
  }

  const usingDefault = selected.size === 0

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {t("members.watchers.title", "Notifications about {{name}}", { name: memberName })}
        </h2>
      </div>

      <div className="px-5 py-3 border-b border-border/50">
        <p className="text-xs text-muted-foreground">
          {t(
            "members.watchers.hint",
            "Choose who is alerted about this member (approvals, geofence, …). If no one is selected, it defaults to org admins and this member's space managers.",
          )}
        </p>
        {usingDefault && (
          <span className="mt-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t("members.watchers.usingDefault", "Using default routing")}
          </span>
        )}
      </div>

      {managers.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("members.watchers.noManagers", "No admins or managers to assign yet.")}
          </p>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto divide-y divide-border/40">
          {managers.map((m) => {
            const checked = selected.has(m.id)
            return (
              <label
                key={m.id}
                className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(m.id)} disabled={save.isPending} />
                <UserAvatar firstName={m.firstName} lastName={m.lastName} avatarUrl={m.avatarUrl} seed={m.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.role === "ADMIN" ? t("roles.admin", "Admin") : t("roles.manager", "Manager")}
                    {m.email ? ` · ${m.email}` : ""}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
