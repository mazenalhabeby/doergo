"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { Crown, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import { personName, CREW_REASON_MAX } from "@hbcfield/shared/client"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/common/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { useJobTime } from "@/hooks/use-job-time"
import { tasksApi, type CrewView } from "@/lib/api"
import { cn } from "@/lib/utils"
import { OptionCard } from "@/components/ui/option-card"

type Member = CrewView["members"][number]

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
  // The office putting somebody on the job, or taking them off it — always with a reason.
  const [forMember, setForMember] = useState<{ member: Member; action: "join" | "leave" } | null>(null)
  const crew = data?.crew
  if (!crew || crew.members.length <= 1) return null

  const leader = crew.members.find((m) => m.user.id === crew.leader.userId) ?? null
  const office = user?.role === "ADMIN" || hasPermission("canAssignTasks")
  const mayHandOver = office || (!!user?.id && crew.leader.userId === user.id)
  const onJob = crew.members.filter((m) => m.joined).length
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "")

  const status = (m: Member): { text: string; tone: "on" | "stopped" | "off" } => {
    if (m.joined &&
      m.selfBlockedSince) return {
        text: m.selfBlockReason ? t("tasks.crew.stoppedWhy", { reason: m.selfBlockReason }) : t("tasks.crew.stopped"),
        tone: "stopped"
      }
    if (m.joined) return { text: t("tasks.crew.onSince", { time: time(m.since) }), tone: "on" }
    return { text: m.onClock ? t("tasks.crew.notOnJob") : t("tasks.crew.notClockedIn"), tone: "off" }
  }

  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-shell">
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
            ? t("tasks.crew.acting", { name: personName(leader.user) })
            : crew.leader.source === "TODAY"
              ? t("tasks.crew.leadsToday", { name: personName(leader.user) })
              : t("tasks.crew.leads", { name: personName(leader.user) })}
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
                <p className="truncate font-medium text-foreground">{personName(m.user)}</p>
                <p className={cn("flex items-center gap-1.5 truncate text-xs",
                  s.tone === "stopped" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                  <span className={cn("size-1.5 shrink-0 rounded-full",
                    s.tone === "on" ? "bg-green-500" : s.tone === "stopped" ? "bg-amber-500" : "bg-muted-foreground/40")} />
                  {s.text}
                </p>
              </div>
              {office && (m.joined || m.onClock) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setForMember({ member: m, action: m.joined ? "leave" : "join" })}>
                  {m.joined ? t("tasks.crew.takeOff") : t("tasks.crew.putOn")}
                </Button>
              ) : null}
              {leads ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  crew.leader.acting
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-primary/10 text-primary")}>
                  <Crown className="size-3" />
                  {crew.leader.acting ? t("tasks.crew.actingChip") : t("tasks.crew.leaderChip")}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>

      <ChangeLeaderDialog open={open} onClose={() => setOpen(false)} taskId={taskId} crew={crew} />
      <MemberOnJobDialog request={forMember} onClose={() => setForMember(null)} taskId={taskId} />
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
        client.invalidateQueries({ queryKey: keys.tasks.time(taskId) }),
        client.invalidateQueries({ queryKey: keys.tasks.detail(taskId) }),
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
          <DialogTitle
            className="flex items-center gap-2"><Crown className="h-5 w-5 text-primary" />{t("tasks.crew.changeLeaderTitle")}</DialogTitle>
          <DialogDescription>{t("tasks.crew.changeLeaderBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5" role="radiogroup" aria-label={t("tasks.crew.newLeader")}>
            <Label>{t("tasks.crew.newLeader")}</Label>
            {others.map((m) => (
              <OptionCard
                key={m.user.id}
                size="sm"
                role="radio"
                aria-checked={to === m.user.id}
                selected={to === m.user.id}
                onClick={() => setTo(m.user.id)}
                className="items-center gap-2.5 text-sm"
              >
                <UserAvatar firstName={m.user.firstName} lastName={m.user.lastName} seed={m.user.id} size="xs" />
                <span className="flex-1 truncate text-foreground">{personName(m.user)}</span>
                <span className="text-xs text-muted-foreground">{m.joined ? t("tasks.crew.onJobShort") : t("tasks.crew.notOnJob")}</span>
              </OptionCard>
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
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-sm transition-colors",
                  scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "TODAY" ? t("tasks.crew.forToday") : t("tasks.crew.forGood")}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crew-lead-reason">{t("tasks.crew.reason")}</Label>
            <Input
              id="crew-lead-reason"
              value={reason}
              maxLength={CREW_REASON_MAX}
              placeholder={t("tasks.crew.reasonPlaceholder")}
              onChange={(e) => setReason(e.target.value)}
            />
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

/**
 * The office putting somebody on the job (their phone is flat, they are there)
 * or taking them off it — the job's history says who did it and why. The
 * server holds them to the clock gate and their own last leave.
 */
function MemberOnJobDialog(
  { request, onClose, taskId }: { request: { member: Member; action: "join" | "leave" } | null; onClose: () => void; taskId: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => { if (request) setReason("") }, [request])
  if (!request) return null
  const name = personName(request.member.user)
  const joining = request.action === "join"

  const submit = async () => {
    if (!reason.trim()) return
    setPending(true)
    try {
      await tasksApi.crewForMember(taskId, request.action, { forUserId: request.member.user.id, reason: reason.trim() })
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.tasks.time(taskId) }),
        client.invalidateQueries({ queryKey: keys.tasks.timeline(taskId) }),
      ])
      toast.success(joining ? t("tasks.crew.putOnDone", { name }) : t("tasks.crew.takeOffDone", { name }))
      onClose()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t("common.error"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{joining ? t("tasks.crew.putOnTitle", { name }) : t("tasks.crew.takeOffTitle", { name })}</DialogTitle>
          <DialogDescription>{joining ? t("tasks.crew.putOnBody", { name }) : t("tasks.crew.takeOffBody", { name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="crew-member-reason">{t("tasks.crew.reasonRequired")}</Label>
          <Input
            id="crew-member-reason"
            value={reason}
            autoFocus
            maxLength={CREW_REASON_MAX}
            placeholder={joining ? t("tasks.crew.putOnPlaceholder") : t("tasks.crew.takeOffPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={pending || !reason.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {joining ? t("tasks.crew.putOn") : t("tasks.crew.takeOff")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
