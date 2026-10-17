"use client"

import { Clock, CalendarOff, ClipboardList, MessageCircle, User, ArrowUpRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useContactActions } from "@/hooks/use-contact-actions"
import { employeesApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { PersonNodeProps } from "../person-node"
import { WorkerAvatar } from "../worker-avatar"
import { keys } from "@/lib/query-keys"

/** Dropdown content that fetches real employee data */
export function WorkerDropdownContent({
  person,
  onPersonClick,
  onClose,
}: {
  person: PersonNodeProps
  onPersonClick?: (userId: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { message } = useContactActions()
  const userId = person.userId!
  // O(1) identity check — you can't message/call yourself; show self actions.
  const isSelf = !!user?.id && user.id === userId
  const selfClock = isSelf && hasAccessModule(user ?? {}, "clock")
  const selfTimeOff = isSelf && hasAccessModule(user ?? {}, "time_off")

  /*
    An external member has no worker statistics to fetch.

    Score, tasks done, active and hours-this-week measure somebody EXECUTING
    work. A client's supervisor approves it — they hold no tasks and never clock
    in — so all four are structurally zero and always will be. For the signed-in
    member we know this before asking, so the request is skipped outright rather
    than made and then hidden; for anybody else the answer arrives with the
    profile and the block is not rendered.
  */
  const { data: detail } = useQuery({
    queryKey: keys.memberRecord.employee(userId),
    queryFn: () => employeesApi.getById(userId),
    // Not for yourself: your own card is reached from your own dashboard, where
    // these numbers are already on screen.
    enabled: !isSelf,
    staleTime: 30000,
  })

  const emp = detail
  const stats = emp?.stats
  /*
    Render the statistics only when we actually HAVE them, and only for somebody
    they can describe.

    Two faults met here. The query is disabled for yourself, so `detail` is
    undefined and every one of these read from `?? 0` — a member opening their
    own card saw 0 done, 0 active, 0h and a dash for a score, none of it real.
    And for an EXTERNAL member the numbers are structurally zero whoever is
    looking: score, tasks and hours measure somebody executing work, and a
    client's supervisor approves it — they hold no tasks and never clock in.

    So: no data, or nothing the data could ever say — no block.
  */
  const isExternalPerson = (isSelf && user?.isExternal === true) || detail?.isExternal === true
  const showWorkerStats = !!detail && !isExternalPerson
  const tasksCompleted = stats?.tasks?.completed ?? 0
  const tasksActive = stats?.tasks?.inProgress ?? 0
  const hoursWeek = stats?.attendance?.totalHoursThisWeek ?? 0
  const onTimeRate = stats?.performance?.onTimeRate ?? 0
  const rating = stats?.performance?.customerRating ?? 0
  const ratingCount = stats?.performance?.ratingCount ?? 0
  const recentActivity = stats?.recentActivity?.slice(0, 3) || []
  const completionRate = stats?.performance?.completionRate ?? 0

  // Performance score adapts to worker type:
  // - Workers WITH customer ratings: 35% on-time + 35% completion + 30% rating
  // - Workers WITHOUT ratings: 50% on-time + 50% completion (no rating penalty)
  const hasCustomerRating = ratingCount > 0
  const perfScore = hasCustomerRating
    ? Math.round(onTimeRate * 0.35 + completionRate * 0.35 + (rating / 5) * 100 * 0.3)
    : Math.round(onTimeRate * 0.5 + completionRate * 0.5)

  // If no tasks at all yet, show neutral instead of 0
  const totalTasks = (stats?.tasks?.total ?? 0)
  const hasData = totalTasks > 0 || hoursWeek > 0
  const displayScore = hasData ? perfScore : null

  const perfColor = displayScore === null ? "text-muted-foreground" : displayScore >= 80 ? "text-green-500" : displayScore >= 60 ? "text-amber-500" : "text-red-500"
  const perfBg = displayScore === null ? "stroke-muted" : displayScore >= 80 ? "stroke-green-500" : displayScore >= 60 ? "stroke-amber-500" : "stroke-red-500"

  return (
    <>
      {/* ── Header ── */}
      <div className="relative px-4 pt-5 pb-4" style={{ background: person.color }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/40" />
        <div className="relative flex items-end gap-3">
          <div className="rounded-full ring-2 ring-white/25 shadow-lg">
            <WorkerAvatar
              initials={person.initials}
              color={person.color}
              status={person.status}
              clockedIn={person.clockedIn}
              imageUrl={person.imageUrl}
              hideDot
              className="[&>div:first-child]:!w-[48px] [&>div:first-child]:!h-[48px] [&>div:first-child]:!min-w-[48px] [&>div:first-child]:!min-h-[48px] [&>div:first-child]:!text-base"
            />
          </div>
          <div className="flex-1 min-w-0 pb-0.5">
            <p className="text-sm font-bold text-white truncate drop-shadow-sm">
              {person.name}{isSelf ? ` ${t("workspace.you")}` : ""}
            </p>
            {emp?.position ? <p className="text-[11px] text-white/70">{emp.position}</p> : null}
          </div>
          {person.tag && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm shrink-0">
              {person.tag.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Performance + Stats — our own workers only, see knownExternalSelf ── */}
      {showWorkerStats && (
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Performance ring */}
        <div className="relative size-14 shrink-0">
          <svg className="size-14 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3" className="stroke-muted/50" />
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3" className={perfBg}
              strokeDasharray={`${((displayScore ?? 0) / 100) * 125.6} 125.6`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-sm font-bold tabular-nums leading-none", perfColor)}>{displayScore ?? "—"}</span>
            <span className="text-[7px] text-muted-foreground uppercase">{t("workspace.score")}</span>
          </div>
        </div>

        {/* Stat columns */}
        <div className="flex-1 grid grid-cols-3 gap-1">
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{tasksCompleted}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.done")}</p>
          </div>
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{tasksActive}</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.active")}</p>
          </div>
          <div className="text-center py-1.5 rounded-lg bg-muted/30">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">{Math.round(hoursWeek)}h</p>
            <p className="text-[8px] text-muted-foreground mt-0.5">{t("workspace.thisWeek")}</p>
          </div>
        </div>
      </div>
      )}

      {/* ── Current Task ── */}
      {person.currentTask && (
        <div className="px-4 pb-3">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">{t("workspace.workingOn")}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/tasks`) }}
            className="w-full text-left group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/25 transition-colors"
          >
            <div className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <p className="text-[11px] font-medium text-foreground truncate flex-1">{person.currentTask}</p>
            <ArrowUpRight className="size-3 text-muted-foreground/0 group-hover:text-blue-500 transition-colors shrink-0" />
          </button>
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">{t("workspace.recent")}</p>
          <div className="space-y-0.5">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                {/* The API sends these UPPERCASE. Compared against lowercase,
                    every branch was false, so each row drew the grey default
                    dot — and `item.title` / `item.time` are not fields this
                    type has ever had, so the text and the date came out empty
                    whenever `description` was missing. */}
                <div className={cn(
                  "size-1.5 rounded-full shrink-0",
                  item.type === "TASK_COMPLETED" ? "bg-green-500" :
                  item.type === "TASK_STARTED" ? "bg-blue-500" :
                  item.type === "CLOCK_IN" ? "bg-emerald-500" : "bg-muted-foreground/40",
                )} />
                <p className="text-[10px] text-foreground/70 truncate flex-1">{item.description || t("workspace.activity")}</p>
                <span className="text-[9px] text-muted-foreground/50 shrink-0 tabular-nums">
                  {item.timestamp?.split("T")[0] ?? ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSelf ? (
        /* Self: profile lives in the top-right user menu — only show useful
           self-service shortcuts (no Message/Call, no profile/tasks links). */
        (selfClock || selfTimeOff) && (
          <>
            <div className="h-px bg-border" />
            <div className="px-3 py-2 flex items-center gap-1.5">
              {selfClock && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); router.push("/my/attendance") }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Clock className="size-3.5" />
                  {t("workspace.attendance")}
                </button>
              )}
              {selfTimeOff && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); router.push("/my/time-off") }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <CalendarOff className="size-3.5" />
                  {t("workspace.timeOff")}
                </button>
              )}
            </div>
          </>
        )
      ) : (
        <>
          <div className="h-px bg-border" />

          {/* ── Communication ── */}
          <div className="px-3 py-2 flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); message(userId) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-foreground text-background text-[11px] font-semibold hover:bg-foreground/90 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              {t("workspace.message")}
            </button>
          </div>

          <div className="h-px bg-border" />

          {/* ── Footer Links ── */}
          <div className="px-3 py-1.5 flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); onPersonClick?.(userId) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <User className="size-3" />
              {t("workspace.profile")}
            </button>
            <div className="w-px h-4 bg-border" />
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); router.push(`/tasks`) }}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ClipboardList className="size-3" />
              {t("workspace.tasks")}
            </button>
          </div>
        </>
      )}
    </>
  )
}
