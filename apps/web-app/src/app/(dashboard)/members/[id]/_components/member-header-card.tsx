"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { personName, type EmployeeStats } from "@hbcfield/shared/client"
import Link from "next/link"
import { UserAvatar } from "@/components/common/user-avatar"
import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import { dateLocale } from "@/lib/format-date"
import { type OrgMember } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"
import { useContactActions } from "@/hooks/use-contact-actions"
import { EditMemberDialog } from "./member-tabs-lazy"
import { useLatched } from "@/hooks/use-latched"

interface MemberHeaderCardProps {
  member: OrgMember
  /** Names of the workspaces the member is assigned to. */
  spaceNames: string[]
  /** The header's quick stats — absent for a viewer who cannot see operational data. */
  stats: EmployeeStats | undefined
  currentUserId: string | undefined
  canManageMembers: boolean
  onSaved: () => void
}

/** The member page's header: who they are, their role and workspaces, Message / Edit, the quick stats. */
export function MemberHeaderCard({
  member,
  spaceNames,
  stats,
  currentUserId,
  canManageMembers,
  onSaved,
}: MemberHeaderCardProps) {
  const { t } = useTranslation()
  const { message, canMessage } = useContactActions()
  const [editOpen, setEditOpen] = useState(false)
  const editMounted = useLatched(editOpen)
  /*
    `?edit=1` opens the editor straight away — the invoice's "Set rate" link
    lands here, and a link that then asks for one more click to find the field
    is a link half done. Read once, from the URL, after the member has loaded.
  */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") setEditOpen(true)
  }, [])

  const roleConfig = roleBadge(member.role, { isExternal: member.isExternal })
  const scheduleLabel =
    member.scheduleType === "FIXED"
      ? t("members.detail.fixedSchedule")
      : member.scheduleType === "FLEXIBLE"
        ? t("members.detail.flexibleHours")
        : null
  const headerStats = stats ? quickStats(stats, t) : null

  const named = member.role !== "ADMIN" ? member.memberRole : null

  return (
    <Panel className="p-0">
      <div className="flex flex-wrap items-start gap-4 px-6 pb-5 pt-[22px]">
        <UserAvatar
          soft
          firstName={member.firstName}
          lastName={member.lastName}
          avatarUrl={member.avatarUrl}
          seed={member.id}
          size="2xl"
        />

        <div className="min-w-0 flex-1">
          <h1
            data-tour="page-member"
            className="text-2xl font-semibold leading-[1.2] tracking-[-0.025em] text-foreground"
          >
            {personName(member)}
          </h1>
          <MemberContactLine email={member.email} dateOfBirth={member.dateOfBirth} position={member.position} />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {member.isActive && (
              <span className={cn(TAG, "text-shell-accent")}>
                <i className="size-1.5 rounded-full bg-shell-live" />
                {t("common.active")}
              </span>
            )}
            {/* Admin (system tier) always shows Admin; otherwise the named org role; otherwise the plain tier label. */}
            {named ? (
              <span className={TAG}>
                <i className="size-1.5 rounded-full" style={{ backgroundColor: named.color || ROLE_COLOR_FALLBACK }} />
                {named.name}
              </span>
            ) : (
              <span className={cn(TAG, member.isExternal && "bg-shell-chip text-shell-warn")}>
                {t(roleConfig.labelKey)}
              </span>
            )}
            {scheduleLabel && (
              <span className={TAG}>
                <Icon name={member.scheduleType === "FIXED" ? "time" : "timer"} size={13} />
                {scheduleLabel}
              </span>
            )}
            {spaceNames.map((name: string) => (
              <Link key={name} href="/locations" className={cn(TAG, "transition-colors hover:bg-accent")}>
                <Icon name="pin" size={13} className="text-muted-foreground" />
                {name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {member.id !== currentUserId && canMessage(member.id) && (
            <Button variant="outline" size="pill" onClick={() => message(member.id)}>
              <Icon name="chat" />
              {t("chat.message", "Message")}
            </Button>
          )}

          {/* Edit button — opens the same dialog inline (no redirect) */}
          {canManageMembers && member.id !== currentUserId && (
            <Button variant="outline" size="pill" onClick={() => setEditOpen(true)}>
              <Icon name="edit" />
              {t("common.edit")}
            </Button>
          )}
        </div>

        {/* Mounted once opened: closed, it still asked for the companies list at page load. */}
        {editMounted && (
          <EditMemberDialog member={editOpen ? member : null} onClose={() => setEditOpen(false)} onSaved={onSaved} />
        )}
      </div>

      {/* Quick stats — Score · Done · Active · This Week */}
      {headerStats && (
        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {headerStats.map((s, i) => (
            <div
              key={s.key}
              className={cn("flex flex-col gap-1 px-[18px] py-3.5", i > 0 && "sm:border-l sm:border-border")}
            >
              <span className="text-[12.5px] text-muted-foreground">{s.label}</span>
              <b className="text-[26px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-foreground">
                {s.value}
              </b>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** A fact under the name (the board's tag): a soft rounded label. */
const TAG =
  "inline-flex h-[26px] items-center gap-1.5 rounded-lg bg-muted px-2.5 text-[12.5px] font-medium text-foreground"

/** Score · Done · Active · This Week, from the member's stats. */
function quickStats(hs: EmployeeStats, t: TFunction) {
  const byStatus = (hs.tasks?.byStatus || {}) as Record<string, number>
  const active = ["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "BLOCKED", "NEW"].reduce(
    (n, k) => n + (byStatus[k] || 0),
    0,
  )
  const ratingCount = hs.performance?.ratingCount ?? 0
  const rating = hs.performance?.customerRating
  const hours = hs.attendance?.totalHoursThisWeek
  return [
    {
      key: "score",
      label: t("members.stats.score", "Score"),
      value: ratingCount > 0 && rating != null ? rating.toFixed(1) : "—",
    },
    { key: "done", label: t("members.stats.done", "Done"), value: String(hs.tasks?.completed ?? 0) },
    { key: "active", label: t("members.stats.active", "Active"), value: String(active) },
    {
      key: "week",
      label: t("members.stats.thisWeek", "This Week"),
      value: hours != null ? `${Math.round(hours)}h` : "0h",
    },
  ]
}

/** The job, the e-mail address and the date of birth, under the member's name. */
function MemberContactLine({ email, dateOfBirth, position }: Pick<OrgMember, "email" | "dateOfBirth" | "position">) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-muted-foreground">
      {position && <span className="text-foreground">{position}</span>}
      {position && <span aria-hidden>·</span>}
      <span>{email}</span>
      {/*
        Date of birth, and the birthday itself.

        ⚠️ Rendered from the "YYYY-MM-DD" string with `T12:00:00`, never `new Date("1990-03-01")`. That parses as
        midnight UTC and prints the 28th of February for anybody west of Greenwich — a person's birthday moving by a
        day depending on where they are reading it.
      */}
      {dateOfBirth && (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={13} />
            {new Date(`${dateOfBirth.slice(0, 10)}T12:00:00`).toLocaleDateString(dateLocale(), {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </>
      )}
    </p>
  )
}
