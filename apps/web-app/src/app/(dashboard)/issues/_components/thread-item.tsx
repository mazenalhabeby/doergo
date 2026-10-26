"use client"

import { Cog } from "lucide-react"
import type { ShiftIssueEvent } from "@/lib/api"
import { cn } from "@/lib/utils"
import { fmt, isImg } from "./issue-display"

/** One line of an issue's thread: a message as a bubble (mine in jade), anything else as a quiet system line. */
export function ThreadItem({
  e,
  mine,
  onOpenImage,
}: {
  e: ShiftIssueEvent
  mine: boolean
  onOpenImage: (uri: string) => void
}) {
  if (e.type === "MESSAGE") {
    return (
      <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-[86%] rounded-2xl px-3.5 py-2.5",
            mine ? "bg-shell-accent text-shell-on-accent" : "bg-muted text-foreground",
          )}
        >
          {!mine && <p className="mb-0.5 text-[11px] font-semibold text-shell-accent">{e.actorName}</p>}
          {e.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.body}</p>}
          {!!e.attachments?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.attachments.map((a) =>
                isImg(a.mimeType) ? (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenImage(a.url ?? a.fileUrl)}
                    className="overflow-hidden rounded-lg transition-transform hover:scale-[1.03]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url ?? a.fileUrl}
                      alt={a.fileName}
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  </button>
                ) : (
                  <a
                    key={a.id}
                    href={a.url ?? a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    {a.fileName}
                  </a>
                ),
              )}
            </div>
          )}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{fmt(e.at)}</span>
      </div>
    )
  }
  const reasonSuffix = e.body ? ` — ${e.body}` : ""
  const label =
    e.type === "CREATED"
      ? `${e.actorName} reported this issue`
      : e.type === "ACKNOWLEDGED"
        ? `${e.actorName} acknowledged`
        : e.type === "ASSIGNED"
          ? `Dispatched to ${e.metadata?.assignedToName ?? "someone"}`
          : e.type === "RESOLVED"
            ? `${e.actorName} marked it resolved${reasonSuffix}`
            : e.type === "REOPENED"
              ? `${e.actorName} reopened it`
              : e.type === "CLOSED"
                ? `${e.actorName} closed it${reasonSuffix}`
                : `${e.actorName} updated the issue${reasonSuffix}`
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
        <Cog className="h-3 w-3" />
        {label}
        <span className="opacity-50">· {fmt(e.at)}</span>
      </span>
    </div>
  )
}
