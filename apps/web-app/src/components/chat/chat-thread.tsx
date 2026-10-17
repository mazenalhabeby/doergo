"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { SocketEvents, type ChatConversation, type ChatMessage } from "@hbcfield/shared/client"
import { useSocketContext } from "@/contexts/socket-context"
import { MessageBubble } from "./message-bubble"
import { ChatComposer } from "./chat-composer"
import { useMarkRead } from "./use-chat-live"
import { useThread } from "./use-thread"
import { chatViewing } from "./chat-viewing"
import { chatToastId } from "./chat-provider"

/** One conversation: its messages (older ones as you scroll up), who is typing, and the box to write in. */
export function ChatThread({ conversation, meId }: { conversation: ChatConversation; meId: string }) {
  const { t } = useTranslation()
  const { subscribe, emit, isConnected } = useSocketContext()
  const markRead = useMarkRead()
  const conversationId = conversation.id
  const { messages, hasMore, loadOlder, loadingOlder, send, edit, remove } = useThread(conversationId, meId)
  const [peerTyping, setPeerTyping] = useState(false)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingSent = useRef(0)
  const typingTimer = useRef<number | undefined>(undefined)
  const stickToEnd = useRef(true)
  // Only what arrives while the thread is open animates in — not the history it opened with.
  const openedAt = useRef(Date.now())
  const last = messages[messages.length - 1]
  const lastMine = [...messages].reverse().find((m) => m.senderId === meId && !m.deletedAt && m.kind !== "SYSTEM")

  // On screen: no pop-up for it, nothing counted unread, and the server pushes nothing to this person.
  useEffect(() => {
    chatViewing.id = conversationId
    toast.dismiss(chatToastId(conversationId))
    if (isConnected) emit("chat_view", { conversationId })
    return () => {
      if (chatViewing.id === conversationId) chatViewing.id = null
      emit("chat_view", { conversationId: null })
    }
  }, [conversationId, isConnected, emit])

  // Read on open and whenever somebody else's message arrives — never for my own.
  useEffect(() => {
    if (!last || last.senderId === meId) return
    setPeerTyping(false)
    markRead(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, last?.id])

  // New messages keep the view at the end — unless the reader scrolled up to read older ones.
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToEnd.current) el.scrollTo({ top: el.scrollHeight })
  }, [messages.length, peerTyping])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      const before = el.scrollHeight
      void loadOlder().then(() =>
        requestAnimationFrame(() => {
          el.scrollTop += el.scrollHeight - before
        }),
      )
    }
  }

  useEffect(() => {
    if (!isConnected) return
    const off = subscribe<{ conversationId?: string; from?: string }>(SocketEvents.CHAT_TYPING, (d) => {
      if (d?.conversationId !== conversationId || d?.from === meId) return
      setPeerTyping(true)
      window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setPeerTyping(false), 3500)
    })
    return () => {
      off()
      window.clearTimeout(typingTimer.current)
    }
  }, [isConnected, subscribe, conversationId, meId])

  const onTyping = () => {
    const now = Date.now()
    if (now - typingSent.current > 2000) {
      typingSent.current = now
      emit("chat_typing", { conversationId })
    }
  }
  const askRemove = (m: ChatMessage) =>
    toast(t("chat.removeAsk", "Remove this message for everyone?"), {
      action: {
        label: t("chat.remove", "Remove"),
        onClick: () => remove.mutate(m.id, { onError: (e) => toast.error((e as Error).message) }),
      },
    })
  const typingName = conversation.type !== "DIRECT" ? t("chat.someone", "Someone") : conversation.otherMember?.firstName

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loadingOlder && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            className="mx-auto block rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("chat.older", "Show older messages")}
          </button>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            list={messages}
            index={i}
            meId={meId}
            peer={conversation.otherMember}
            pending={!!m.pending}
            conversation={conversation}
            showReceipt={m.id === lastMine?.id}
            arriving={!!m.pending || Date.parse(m.createdAt) >= openedAt.current - 1500}
            onEdit={(msg) => setEditing({ id: msg.id, body: msg.body })}
            onRemove={askRemove}
          />
        ))}
      </div>

      {peerTyping && (
        <div className="flex items-center gap-2 bg-background px-3 pt-1.5" aria-live="polite">
          <div className="motion-msg-in motion-wave flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3 py-2.5 text-muted-foreground">
            <i />
            <i />
            <i />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {typingName} {t("chat.typing", "is typing…")}
          </span>
        </div>
      )}
      {send.isError && <p className="px-3 pb-1 text-xs text-red-500">{(send.error as Error).message}</p>}

      {conversation.isClosed ? (
        <div className="border-t border-border bg-muted/40 px-3.5 py-3">
          <p className="text-center text-xs text-muted-foreground">
            {conversation.type === "TASK"
              ? t("chat.taskChatClosed", "This job is over, so its chat is closed. You can still read what was said.")
              : t(
                  "chat.conversationClosed",
                  "This workspace is no longer shared, so this conversation is closed. You can still read what was said.",
                )}
          </p>
        </div>
      ) : (
        <ChatComposer
          conversationId={conversationId}
          onTyping={onTyping}
          onSend={(body, attachments) => {
            stickToEnd.current = true
            send.mutate({ id: crypto.randomUUID(), body, attachments })
          }}
          editing={editing}
          onSaveEdit={(id, body) => {
            edit.mutate({ id, body }, { onError: (e) => toast.error((e as Error).message) })
            setEditing(null)
          }}
          onCancelEdit={() => setEditing(null)}
        />
      )}
    </div>
  )
}
