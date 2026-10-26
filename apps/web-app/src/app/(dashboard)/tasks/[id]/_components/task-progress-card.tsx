"use client"

import { personName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { MessageSquare, Timer, UserPlus } from "lucide-react"

import { type WorkflowStatus } from "@/lib/api"
import { useContactActions } from "@/hooks/use-contact-actions"
import { cn, formatDurationMs } from "@/lib/utils"
import { UserAvatar, StackedAvatars } from "@/components/common/user-avatar"

interface AssignedUser {
  id?: string
  firstName: string
  lastName: string
  phone?: string
  specialty?: string | null
  avatarUrl?: string | null
}

interface TaskAssignee {
  id: string
  userId: string
  role: "LEAD" | "MEMBER"
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null }
  createdAt: string
}

interface TaskProgressCardProps {
  assignees: TaskAssignee[]
  assignedTo: AssignedUser | null
  isCompleted: boolean
  taskStatus: string
  routeStartedAt?: string | null
  routeEndedAt?: string | null
  workflowStatuses?: WorkflowStatus[]
}

// ─── Fallback steps ─────────────────────────────────────────────────────────

const FALLBACK_STEPS = [
  { key: "NEW", label: "Created", tKey: "tasks.progress.steps.created" },
  { key: "ASSIGNED", label: "Assigned", tKey: "tasks.progress.steps.assigned" },
  { key: "ACCEPTED", label: "Confirmed", tKey: "tasks.progress.steps.confirmed" },
  { key: "EN_ROUTE", label: "En Route", tKey: "tasks.progress.steps.enRoute" },
  { key: "IN_PROGRESS", label: "Working", tKey: "tasks.progress.steps.working" },
  { key: "COMPLETED", label: "Completed", tKey: "tasks.progress.steps.completed" },
]

const FALLBACK_ORDER: Record<string, number> = {
  DRAFT: 0,
  NEW: 0,
  ASSIGNED: 1,
  ACCEPTED: 2,
  EN_ROUTE: 3,
  ARRIVED: 4,
  IN_PROGRESS: 4,
  BLOCKED: 4,
  COMPLETED: 5,
  CLOSED: 5,
}

function buildSteps(workflowStatuses?: WorkflowStatus[]) {
  if (workflowStatuses && workflowStatuses.length > 0) {
    return [...workflowStatuses]
      .filter((s) => !s.isCanceled)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ key: s.key, label: s.name }))
  }
  return FALLBACK_STEPS
}

function getStepIndex(status: string, steps: { key: string }[], workflowStatuses?: WorkflowStatus[]): number {
  const idx = steps.findIndex((s) => s.key === status)
  if (idx >= 0) return idx
  if (!workflowStatuses || workflowStatuses.length === 0) {
    return Math.min(FALLBACK_ORDER[status] ?? 0, steps.length - 1)
  }
  return 0
}

export function TaskProgressCard({
  assignees,
  assignedTo,
  isCompleted,
  taskStatus,
  routeStartedAt,
  routeEndedAt,
  workflowStatuses,
}: TaskProgressCardProps) {
  const { t } = useTranslation()

  const steps = buildSteps(workflowStatuses)
  const currentStepIndex = getStepIndex(taskStatus, steps, workflowStatuses)

  const elapsedTime = (() => {
    // The drive ends at the arrival, not at the job's completion.
    if (routeEndedAt && routeStartedAt) {
      return formatDurationMs(new Date(routeEndedAt).getTime() - new Date(routeStartedAt).getTime())
    }
    if (routeStartedAt) {
      return formatDurationMs(Date.now() - new Date(routeStartedAt).getTime())
    }
    return null
  })()

  // Resolve the primary person: the lead, else the first assignee, else the
  // legacy single assignee (assignedTo).
  const lead = assignees.find((a) => a.role === "LEAD")
  const primary = lead ?? assignees[0]
  const primaryUser: AssignedUser | null = primary
    ? {
        id: primary.user.id,
        firstName: primary.user.firstName,
        lastName: primary.user.lastName,
        avatarUrl: primary.user.avatarUrl,
        phone: assignedTo?.id === primary.user.id ? assignedTo?.phone : undefined,
      }
    : assignedTo
  // Everyone else shown as stacked avatars — EXCLUDE the primary so the same
  // person is never drawn twice (the bug: a lone MEMBER was both the primary
  // avatar and a stacked avatar).
  const members = assignees.filter((a) => a.user.id !== primary?.user.id)

  const { message, canMessage } = useContactActions()

  /**
   * Who these buttons reach: the first person on the task who isn't you, lead
   * first.
   *
   * A member opening their own task was offered a Message button that reached
   * themselves, and chat refuses self-conversations — so the click did nothing,
   * silently, exactly like the mailto it replaced. Skipping yourself also gives
   * a lead with members someone real to reach rather than a dead button.
   *
   * Nobody else on the task means nobody to contact, and the buttons don't
   * appear at all.
   */
  const contact =
    [primary, ...members].find((a) => a && canMessage(a.user.id))?.user ??
    (canMessage(assignedTo?.id) ? assignedTo : null)

  // Both buttons must reach the SAME person. Only the legacy assignedTo record
  // carries a phone number, so we have one to dial exactly when the contact is
  // that person; otherwise Call says so rather than ringing someone else.

  return (
    <div className="mb-4 overflow-hidden rounded-[22px] border border-border bg-card shadow-shell">
      {/* Header row */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t("tasks.progress.progressLabel")}
          </span>
          {elapsedTime && (
            <>
              <span className="w-px h-3.5 bg-border" />
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Timer className="size-3" />
                {elapsedTime}
              </span>
            </>
          )}
        </div>

        {/* Assignee(s) */}
        {primaryUser ? (
          <div className="flex items-center gap-2.5">
            {/* Primary avatar + stacked members */}
            <div className="flex items-center">
              <UserAvatar
                firstName={primaryUser.firstName}
                lastName={primaryUser.lastName}
                avatarUrl={primaryUser.avatarUrl}
                seed={primaryUser.id}
                size="sm"
              />
              {members.length > 0 && (
                <StackedAvatars
                  users={members.map((m) => ({
                    id: m.user.id,
                    firstName: m.user.firstName,
                    lastName: m.user.lastName,
                    avatarUrl: m.user.avatarUrl,
                  }))}
                  max={3}
                  size="xs"
                  className="-ml-1.5"
                />
              )}
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground leading-none">{personName(primaryUser)}</span>
              {lead && members.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60 leading-none mt-0.5">
                  {t("tasks.progress.lead")} · {members.length}{" "}
                  {members.length === 1 ? t("tasks.progress.member") : t("tasks.progress.members")}
                </span>
              )}
            </div>

            {contact && (
              <div className="flex items-center gap-1 ml-1">
                {/* Straight into the conversation — no list, no choosing. */}
                <button
                  onClick={() => contact.id && message(contact.id)}
                  className={
                    "flex size-8 items-center justify-center rounded-full bg-shell-chip text-muted-foreground " +
                    "transition-colors hover:text-foreground"
                  }
                  title={t("tasks.progress.message")}
                >
                  <MessageSquare className="size-3" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <UserPlus className="size-3.5" />
            <span>{t("tasks.progress.unassigned")}</span>
          </div>
        )}
      </div>

      {/* Progress steps — the boards' step bars: done and current in the accent, the current one named in ink */}
      <div className="px-5 py-4">
        <div className="flex gap-1">
          {steps.map((step, index) => {
            const reached = index <= currentStepIndex
            const isActive = index === currentStepIndex
            return (
              <div
                key={step.key}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-1.5 text-[11px]",
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <i
                  className={cn(
                    "h-[5px] rounded-full transition-colors duration-500",
                    reached ? "bg-shell-accent" : "bg-muted",
                    isActive && !isCompleted && "animate-pulse",
                  )}
                />
                <span className="truncate">{"tKey" in step && step.tKey ? t(step.tKey as string) : step.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
