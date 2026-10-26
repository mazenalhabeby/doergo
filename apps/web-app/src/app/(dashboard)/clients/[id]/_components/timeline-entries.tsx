"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Trash2, CheckSquare, ChevronDown as ChevronDownIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { CustomerActivity } from "@/lib/api"
import { customerStageLabel } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { type FeedItem, relTime, fmtDate } from "../_lib/customer-record-lib"

/* Two of the timeline's kinds of entry: a job of this client's (a card that opens it) and a line the system wrote. */

/** One of the client's jobs, in the feed — the card opens the job. */
export function TaskEntry({ a }: { a: Extract<FeedItem, { type: "TASK" }> }) {
  const { t } = useTranslation()
  const router = useRouter()
  const tk = a.task
  const done = ["COMPLETED", "CLOSED"].includes(tk.status)
  return (
    <li className="group relative flex gap-3 py-1">
      <span
        className={
          "z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center " +
          "rounded-full bg-shell-accent-soft text-shell-accent ring-4 ring-background"
        }
      >
        <CheckSquare className="h-3.5 w-3.5" />
      </span>
      <button
        onClick={() => router.push(`/tasks/${tk.id}`)}
        className={
          "min-w-0 flex-1 rounded-[14px] border border-border bg-card px-3.5 py-2.5 " +
          "text-left transition-colors hover:bg-accent"
        }
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{t("customers.task", "Task")}</span>
          <span className="text-muted-foreground/40">·</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              done ? "bg-shell-accent-soft text-shell-accent" : "bg-muted text-muted-foreground",
            )}
          >
            {tk.status}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="shrink-0">{relTime(a.createdAt)}</span>
          <ChevronDownIcon className="ml-auto h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
        </div>
        <p className={cn("mt-1 truncate text-sm font-medium text-foreground", done && "line-through opacity-70")}>
          {tk.title}
        </p>
        {tk.dueDate && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("customers.dueAt", "Due {{date}}", { date: fmtDate(tk.dueDate) })}
          </p>
        )}
      </button>
    </li>
  )
}

/** A stage change or an invite — a quiet line, no card. */
export function SystemEntry({
  a,
  icon: Icon,
  author,
  canWork,
  onDelete,
}: {
  a: CustomerActivity
  icon: LucideIcon
  author: string
  canWork: boolean
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <li className="group relative flex items-center gap-3 py-0.5">
      <span
        className={
          "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
          "bg-muted text-muted-foreground ring-4 ring-background"
        }
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">
          {a.type === "STATUS" ? (
            <>
              {t("customers.movedTo", "moved to")}{" "}
              <span className="font-semibold text-foreground">{customerStageLabel(a.metadata?.to || "")}</span>
            </>
          ) : (
            a.body || t("customers.act.system", "System")
          )}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate">{author}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="shrink-0">{relTime(a.createdAt)}</span>
        <button
          hidden={!canWork}
          onClick={onDelete}
          className={
            "ml-auto shrink-0 opacity-0 transition-opacity hover:text-destructive " + "group-hover:opacity-100"
          }
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </p>
    </li>
  )
}
