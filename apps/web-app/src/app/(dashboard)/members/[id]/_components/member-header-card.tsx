"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { personName, type EmployeeStats } from "@hbcfield/shared/client"
import Link from "next/link"
import { MapPin, Pencil, Clock, Timer, MessageSquare, Mail, Cake } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import { dateLocale } from "@/lib/format-date"
import { type OrgMember } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="shrink-0 rounded-full ring-4 ring-background shadow-md">
            <UserAvatar
              firstName={member.firstName}
              lastName={member.lastName}
              avatarUrl={member.avatarUrl}
              seed={member.id}
              size="2xl"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 data-tour="page-member" className="text-2xl font-bold tracking-tight text-foreground">
                {personName(member)}
              </h1>
              {member.isActive && (
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 " +
                    "py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t("common.active")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {member.position && <span className="text-sm text-muted-foreground">{member.position}</span>}
              {member.position && <span className="text-muted-foreground/40">·</span>}
              {(() => {
                // Admin (system tier) always shows Admin; otherwise the named
                // org role (Manager/custom); otherwise the plain tier label.
                const named = member.role !== "ADMIN" ? member.memberRole : null
                return named ? (
                  <Badge
                    variant="outline"
                    className="text-xs font-medium border gap-1"
                    style={{ borderColor: named.color || undefined, color: named.color || undefined }}
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: named.color || ROLE_COLOR_FALLBACK }}
                    />
                    {named.name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className={cn("text-xs font-medium border", roleConfig.className)}>
                    {t(roleConfig.labelKey)}
                  </Badge>
                )
              })()}
              {scheduleLabel && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-medium border gap-1",
                      member.scheduleType === "FIXED"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
                    )}
                  >
                    {member.scheduleType === "FIXED" ? <Clock className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                    {scheduleLabel}
                  </Badge>
                </>
              )}
            </div>
            <MemberContactLine email={member.email} dateOfBirth={member.dateOfBirth} />
            {spaceNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {spaceNames.map((name: string) => (
                  <Link key={name} href="/locations">
                    <Badge
                      variant="secondary"
                      className={
                        "text-xs font-normal py-0.5 px-2 gap-1 hover:bg-secondary/80 " +
                        "transition-colors cursor-pointer"
                      }
                    >
                      <MapPin className="h-3 w-3" />
                      {name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {member.id !== currentUserId && canMessage(member.id) && (
          <Button size="sm" onClick={() => message(member.id)} className="rounded-lg shadow-sm">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            {t("chat.message", "Message")}
          </Button>
        )}

        {/* Edit button — opens the same dialog inline (no redirect) */}
        {canManageMembers && member.id !== currentUserId && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="rounded-lg shadow-sm">
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {t("common.edit")}
          </Button>
        )}

        {/* Mounted once opened: closed, it still asked for the companies list at page load. */}
        {editMounted && (
          <EditMemberDialog member={editOpen ? member : null} onClose={() => setEditOpen(false)} onSaved={onSaved} />
        )}
      </div>

      {/* Quick stats — Score · Done · Active · This Week */}
      {headerStats && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-4">
          {headerStats.map((s) => (
            <div key={s.key} className="rounded-xl bg-muted/40 px-3 py-2.5 text-center">
              <p className="text-xl font-bold tabular-nums text-foreground leading-none">{s.value}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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

/** The e-mail address and the date of birth, under the member's name. */
function MemberContactLine({ email, dateOfBirth }: Pick<OrgMember, "email" | "dateOfBirth">) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" />
        {email}
      </span>
      {/*
        Date of birth, and the birthday itself.

        ⚠️ Rendered from the "YYYY-MM-DD" string with `T12:00:00`,
        never `new Date("1990-03-01")`. That parses as midnight UTC
        and prints the 28th of February for anybody west of
        Greenwich — a person's birthday moving by a day depending on
        where they are reading it.
      */}
      {dateOfBirth && (
        <span className="flex items-center gap-1.5">
          <Cake className="h-3.5 w-3.5" />
          {new Date(`${dateOfBirth.slice(0, 10)}T12:00:00`).toLocaleDateString(dateLocale(), {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      )}
    </div>
  )
}
