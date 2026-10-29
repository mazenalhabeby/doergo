"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { OrgMember } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { spaceMembersApi, type employeesApi } from "@/lib/api"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { Panel } from "@/components/page/page-kit"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MemberAccessInSpace } from "@/components/spaces/member-access"
import { cn } from "@/lib/utils"

type Assignment = Awaited<ReturnType<typeof employeesApi.getAssignments>>[number]

/**
 * A person's access in ONE place (decided 2026-08, back since the workspace roles moved onto each workspace's
 * page): the company row, then a row per workspace they work in — their role there and their trade. A row opens
 * the same roles + permission builder the workspace's own member panel shows (`MemberAccessInSpace`), right here.
 * One read for the table (their workspaces, already loaded for the page); a workspace's details only when opened.
 */
export function AccessWorkspaces({ member, assignments }: { member: OrgMember; assignments: Assignment[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { data: spaces } = useSpaceDirectory({ enabled: adding })
  const free = (spaces ?? []).filter((s) => s.isActive !== false && !assignments.some((a) => a.locationId === s.id))

  const add = useMutation({
    mutationFn: (spaceId: string) => spaceMembersApi.assign(spaceId, { userId: member.id }),
    onSuccess: (_r, spaceId) => {
      qc.invalidateQueries({ queryKey: keys.memberRecord.assignments() })
      qc.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      setAdding(false)
      setOpen(spaceId)
      notify.success(t("scheduling.members.toast.added"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const roleName = (a: Assignment) =>
    !a.role ? t("members.access.noRole") : a.role.personalAssignmentId ? t("members.access.personal") : a.role.name
  const plain = [
    t("members.access.plainCompany", { role: member.memberRole?.name ?? t("members.access.noRole") }),
    ...assignments.map((a) =>
      t(a.workRole && !a.role ? "members.access.plainTrade" : "members.access.plainHere", {
        role: a.role ? roleName(a) : a.workRole?.name,
        place: a.location?.name ?? "—",
      }),
    ),
  ].join(" · ")

  const row = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-[18px]">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-shell-accent-soft text-shell-accent">
          <Icon name="workspaces" size={16} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("members.access.whereTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("members.access.whereHint")}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px] divide-y divide-border border-y border-border">
          <div className={cn(row, "py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground")}>
            <span>{t("members.access.where")}</span>
            <span>{t("members.access.role")}</span>
            <span>{t("members.access.trade")}</span>
            <span />
          </div>
          <div className={row}>
            <span className="flex items-center gap-2 font-semibold">
              <Icon name="home" size={16} />
              {t("members.access.company")}
            </span>
            <span>{member.memberRole?.name ?? t("members.access.noRole")}</span>
            <span className="text-muted-foreground">—</span>
            <span className="text-xs text-muted-foreground">{t("members.access.companyBelow")}</span>
          </div>
          {assignments.map((a) => {
            const isOpen = open === a.locationId
            return (
              <div key={a.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : a.locationId)}
                  className={cn(row, "w-full text-left hover:bg-accent/50", isOpen && "bg-shell-accent-soft")}
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <Icon name="workspaces" size={16} />
                    <span className="truncate">{a.location?.name ?? "—"}</span>
                  </span>
                  <span className="truncate">{roleName(a)}</span>
                  <span className="truncate text-muted-foreground">{a.workRole?.name ?? "—"}</span>
                  <span className="flex items-center gap-1 text-xs text-shell-accent">
                    {t(isOpen ? "members.access.close" : "members.access.open")}
                    <Icon name="chevronDown" size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-card px-4 py-4">
                    <MemberAccessInSpace spaceId={a.locationId} userId={member.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {!adding ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} />
            {t("members.access.addWorkspace")}
          </Button>
        ) : (
          <div className="w-64">
            <Select onValueChange={(id) => add.mutate(id)} disabled={add.isPending}>
              <SelectTrigger aria-label={t("members.access.addWorkspace")}>
                <SelectValue placeholder={t("members.access.chooseWorkspace")} />
              </SelectTrigger>
              <SelectContent>
                {free.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <p className="mx-5 mb-5 rounded-xl bg-shell-accent-soft px-4 py-3 text-sm">
        <b>{t("members.access.plainTitle")}</b> {plain}
      </p>
    </Panel>
  )
}
