"use client"

import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { GradientIcon } from "@/components/ui/gradient-icon"
import {
  chatSystemLine,
  mayChangeMessage,
  readState,
  bubbleShape,
  chatDayLabel,
  chatTime,
  type ChatConversation,
  type ChatMessage,
  type ChatUserRef,
} from "@hbcfield/shared/client"
import { useTimeFormat } from "@/hooks"
import { ChatAvatar } from "./chat-avatar"
import { AttachmentList } from "./attachment-list"

/**
 * One message, shaped by its neighbours (a day line, grouping, the time under
 * the last of a run), with its files, "edited", "removed", and — under my
 * newest message — whether it was read. Edit / Remove appear on hover while
 * the shared rule allows them (your own, 15 minutes).
 */
export function MessageBubble({
  list,
  index,
  meId,
  peer,
  pending,
  conversation,
  showReceipt,
  onEdit,
  onRemove,
  arriving,
}: {
  list: readonly ChatMessage[]
  index: number
  meId: string
  peer?: ChatUserRef | null
  pending: boolean
  conversation: ChatConversation
  showReceipt: boolean
  onEdit: (m: ChatMessage) => void
  onRemove: (m: ChatMessage) => void
  /** Arrived while the thread is open: it animates in (mine rises from the box, theirs pops in). */
  arriving?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { hour12 } = useTimeFormat()
  const m = list[index]!
  const mine = m.senderId === meId
  // A system line ("Anna added Karim") stands alone; a run also breaks after 5 quiet minutes.
  const { newDay, grouped, lastOfGroup } = bubbleShape(list, index, undefined, { groupWithinMs: 5 * 60000 })
  const removed = !!m.deletedAt
  const changeable = mine && !pending && mayChangeMessage(m, meId)
  const receipt = showReceipt ? readState(conversation, m) : null
  const sender = m.sender ?? peer
  const dayLine = newDay && (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
        {chatDayLabel(m.createdAt, i18n.language, t)}
      </span>
    </div>
  )

  if (m.kind === "SYSTEM") {
    const line = chatSystemLine(m.meta, meId, t("chat.you", "You"))
    return (
      <div>
        {dayLine}
        {line && (
          <p className="motion-fade-in mx-auto my-2 max-w-[80%] text-center text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
            {t(`chat.system.${line.key}`, line.values)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      {dayLine}
      <div
        className={`group flex items-end gap-2 ${grouped
          ? "mt-0.5"
          : "mt-2.5"} ${mine ? "justify-end" : "justify-start"} ${arriving ? (mine ? "motion-msg-sent" : "motion-msg-in") : ""}`}
      >
        {!mine && (
          <span className="w-7 shrink-0">{lastOfGroup ? <ChatAvatar u={sender} size={28} dot={false} /> : null}</span>
        )}
        {changeable && !removed && (
          <span className="flex gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={() => onEdit(m)}
              aria-label={t("chat.edit", "Edit")}
              title={t("chat.edit", "Edit")}
              className="icon-motion rounded-md p-1 hover:bg-muted"
            >
              <GradientIcon name="edit" size={16} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(m)}
              aria-label={t("chat.remove", "Remove")}
              title={t("chat.remove", "Remove")}
              className="icon-motion rounded-md p-1 hover:bg-red-500/10"
            >
              <GradientIcon name="trash" size={16} />
            </button>
          </span>
        )}
        <div className={`flex min-w-0 max-w-[74%] flex-col ${mine ? "items-end" : "items-start"}`}>
          {!mine && conversation.type !== "DIRECT" && !grouped && sender && (
            <span className="mb-0.5 px-1 text-[11px] font-semibold text-blue-600">{sender.firstName}</span>
          )}
          <div
            className={`whitespace-pre-wrap [overflow-wrap:anywhere] px-3 py-2 text-[13.5px] leading-snug shadow-sm ${
              removed
                ? "rounded-2xl border border-dashed border-border bg-transparent italic text-muted-foreground"
                : mine
                  ? `bg-gradient-to-br from-blue-500 to-blue-600 text-white ${lastOfGroup
                    ? "rounded-2xl rounded-br-md"
                    : "rounded-2xl"} ${pending ? "opacity-70" : ""}`
                  : `bg-muted text-foreground ${lastOfGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
            }`}
          >
            {removed ? t("chat.removed", "Message removed") : m.body}
            {!removed && <AttachmentList items={m.attachments ?? []} mine={mine} />}
          </div>
          {(lastOfGroup || receipt) && (
            <span className="mt-1 px-1 text-[10px] text-muted-foreground">
              {chatTime(m.createdAt, i18n.language, hour12)}
              {m.editedAt && !removed ? ` · ${t("chat.edited", "edited")}` : ""}
              {receipt && !pending ? (
                <>
                  {" "}
                  · <Receipt r={receipt} group={conversation.type !== "DIRECT"} t={t} />
                </>
              ) : pending ? (
                ` · ${t("chat.sending", "Sending…")}`
              ) : (
                ""
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** One tick when sent; a second slides in and both turn blue once read. */
function Receipt({ r, group, t }: { r: { readBy: number; of: number }; group: boolean; t: TFunction }) {
  const read = r.readBy > 0
  const text = !read
    ? t("chat.sent", "Sent")
    : !group
      ? t("chat.read", "Read")
      : r.readBy >= r.of
        ? t("chat.seenByAll", "Seen by everyone")
        : t("chat.seenBy", { count: r.readBy, defaultValue: "Seen by {{count}}" })
  const tick = (cls?: string) => (
    <svg className={cls} width="15" height="11" viewBox="0 0 16 12" aria-hidden="true">
      <path
        d="m1.5 6.5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="receipt-ticks" data-state={read ? "read" : "sent"}>
        {tick()}
        {tick("t2")}
      </span>
      {text}
    </span>
  )
}
