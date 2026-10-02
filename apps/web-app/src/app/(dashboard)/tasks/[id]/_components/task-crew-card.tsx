"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { Crown, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import { CREW_REASON_MAX } from "@hbcfield/shared/client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { useJobTime } from "@/hooks/use-job-time"
import { tasksApi, type CrewView } from "@/lib/api"
import { cn } from "@/lib/utils"

type Member = CrewView["members"][number]
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim()

/**
 * The crew on a job (packages/shared/src/tasks/crew.ts): who is on it now,
 * who stopped on their own and why, and who leads — or stands in for the
 * leader today. The office (or whoever leads) can hand THIS job's lead to
 * somebody already on its crew, for today or for good.
 *
 * Rides on the same read as the job-time card. Renders nothing on a job with
 * one worker: they are the crew and the leader.
 */
export function TaskCrewCard({ taskId, paused }: { taskId: string; paused: boolean }) {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()
  const { data } = useJobTime(taskId, paused)
  const [open, setOpen] = useState(false)
  const crew = data?.crew
  if (!crew || crew.members.length <= 1) return null

  const leader = crew.members.find((m) => m.user.id === crew.leader.userId) ?? null
  const mayHandOver = user?.role === "ADMIN" || hasPermission("canAssignTasks") || (!!user?.id && crew.leader.userId === user.id)
  const onJob = crew.members.filter((m) => m.joined).length
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "")

  const status = (m: Member): { text: string; tone: "on" | "stopped" | "off" } => {
    if (m.joined && m.selfBlockedSince) return { text: m.selfBlockReason ? t("tasks.crew.stoppedWhy", { reason: m.selfBlockReason }) : t("tasks.crew.stopped"), tone: "stopped" }
    if (m.joined) return { text: t("tasks.crew.onSince", { time: time(m.since) }), tone: "on" }
    return { text: m.onClock ? t("tasks.crew.notOnJob") : t("tasks.crew.notClockedIn"), tone: "off" }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{t("tasks.crew.title")}</span>
        <span className="text-xs text-muted-foreground">{t("tasks.crew.onJob", { count: onJob, total: crew.members.length })}</span>
        {mayHandOver ? (
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => setOpen(true)}>
            {t("tasks.crew.changeLeader")}
          </Button>
        ) : null}
      </div>

      {leader ? (
        <p className={cn("mt-2 text-xs", crew.leader.acting ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {crew.leader.acting
            ? t("tasks.crew.acting", { name: fullName(leader.user) })
            : crew.leader.source === "TODAY"
              ? t("tasks.crew.leadsToday", { name: fullName(leader.user) })
              : t("tasks.crew.leads", { name: fullName(leader.user) })}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2.5">
        {crew.members.map((m) => {
          const s = status(m)
          const leads = m.user.id === crew.leader.userId
          return (
            <li key={m.user.id} className="flex items-center gap-2.5 text-sm">
              <UserAvatar firstName={m.user.firstName} lastName={m.user.lastName} seed={m.user.id} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{fullName(m.user)}</p>
                <p className={cn("flex items-center gap-1.5 truncate text-xs",
                  s.tone === "stopped" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                  <span className={cn("size-1.5 shrink-0 rounded-full",
                    s.tone === "on" ? "bg-green-500" : s.tone === "stopped" ? "bg-amber-500" : "bg-muted-foreground/40")} />
                  {s.text}
                </p>
              </div>
              {leads ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  crew.leader.acting ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-primary/10 text-primary")}>
                  <Crown className="size-3" />
                  {crew.leader.acting ? t("tasks.crew.actingChip") : t("tasks.crew.leaderChip")}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>

      <ChangeLeaderDialog open={open} onClose={() => setOpen(false)} taskId={taskId} crew={crew} />
    </div>
  )
}

/** Hand THIS job's lead over — only to somebody already on its crew. */
function ChangeLeaderDialog({ open, onClose, taskId, crew }: { open: boolean; onClose: () => void; taskId: string; crew: CrewView }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [to, setTo] = useState<string | null>(null)
  const [scope, setScope] = useState<"TODAY" | "PERMANENT">("TODAY")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => { if (open) { setTo(null); setScope("TODAY"); setReason("") } }, [open])
  const others = crew.members.filter((m) => m.user.id !== crew.leader.userId)

  const submit = async () => {
    if (!to) return
    setPending(true)
    try {
      await tasksApi.changeLead(taskId, { toUserId: to, scope, ...(reason.trim() ? { reason: reason.trim() } : {}) })
      await Promise.all([
        client.invalidateQueries({ queryKey: ["task-time", taskId] }),
        client.invalidateQueries({ queryKey: ["task", taskId] }),
      ])
      toast.success(t("tasks.crew.changed"))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("common.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-primary" />{t("tasks.crew.changeLeaderTitle")}</DialogTitle>
          <DialogDescription>{t("tasks.crew.changeLeaderBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5" role="radiogroup" aria-label={t("tasks.crew.newLeader")}>
            <Label>{t("tasks.crew.newLeader")}</Label>
            {others.map((m) => (
              <button
                key={m.user.id}
                type="button"
                role="radio"
                aria-checked={to === m.user.id}
                onClick={() => setTo(m.user.id)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  to === m.user.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
              >
                <UserAvatar firstName={m.user.firstName} lastName={m.user.lastName} seed={m.user.id} size="xs" />
                <span className="flex-1 truncate text-foreground">{fullName(m.user)}</span>
                <span className="text-xs text-muted-foreground">{m.joined ? t("tasks.crew.onJobShort") : t("tasks.crew.notOnJob")}</span>
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-border p-0.5" role="radiogroup" aria-label={t("tasks.crew.howLong")}>
            {(["TODAY", "PERMANENT"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={scope === k}
                onClick={() => setScope(k)}
                className={cn("flex-1 rounded-full px-3 py-1 text-sm transition-colors", scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "TODAY" ? t("tasks.crew.forToday") : t("tasks.crew.forGood")}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crew-lead-reason">{t("tasks.crew.reason")}</Label>
            <Input id="crew-lead-reason" value={reason} maxLength={CREW_REASON_MAX} placeholder={t("tasks.crew.reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={pending || !to}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("tasks.crew.handOver")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
