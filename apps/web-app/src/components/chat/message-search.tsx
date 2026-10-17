"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { chatSearchQuery, conversationTitle, chatRelTime, type ChatSearchHit } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { ConversationAvatar } from "./chat-avatar"

/** The typed words, settled: a search is asked once typing pauses, not per key. */
function useSettled(value: string, ms = 300) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return settled
}

/**
 * Messages that contain the typed words — in the caller's own conversations
 * only (the server joins membership into the query). Under the conversation
 * matches in the sidebar; a hit opens its conversation.
 */
export function MessageSearch({ query, onOpen }: { query: string; onOpen: (conversationId: string) => void }) {
  const { t, i18n } = useTranslation()
  const settled = useSettled(query.trim())
  const searchable = settled.length >= 2 && !!chatSearchQuery(settled)
  const { data, isFetching } = useQuery({
    queryKey: keys.chat.search(settled),
    queryFn: () => chatApi.search(settled),
    enabled: searchable,
    staleTime: 30_000,
  })
  if (!searchable) return null
  const hits = data?.data ?? []

  return (
    <div className="border-t border-border p-1.5">
      <div className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("chat.messagesFound", "Messages")}
        {isFetching && <Loader2 className="size-3 animate-spin" />}
      </div>
      {!isFetching && hits.length === 0 ? (
        <p className="px-2.5 py-3 text-xs text-muted-foreground">
          {t("chat.noMessagesFound", "No messages with these words.")}
        </p>
      ) : (
        hits.map((h: ChatSearchHit, i: number) => (
          <button
            key={h.message.id}
            type="button"
            onClick={() => onOpen(h.conversation.id)}
            style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
            className="motion-stagger flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent"
          >
            <ConversationAvatar c={h.conversation} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {conversationTitle(h.conversation as never, i18n.language)}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {chatRelTime(h.message.createdAt, i18n.language)}
                </span>
              </span>
              <span className="line-clamp-2 text-[13px] text-muted-foreground">
                {h.message.sender && h.conversation.type !== "DIRECT" ? `${h.message.sender.firstName}: ` : ""}
                <Highlight text={h.message.body} words={settled} />
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}

/** The words found, marked — every word as a prefix, the way the server matched them. */
function Highlight({ text, words }: { text: string; words: string }) {
  const parts = words.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (!parts.length) return <>{text}</>
  const re = new RegExp(`(${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu")
  return (
    <>
      {text.split(re).map((piece, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-yellow-200/70 px-0.5 text-foreground dark:bg-yellow-500/30">
            {piece}
          </mark>
        ) : (
          <span key={i}>{piece}</span>
        ),
      )}
    </>
  )
}
