"use client"

import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  SocketEvents,
  appendMessage,
  applyChangedToConversations,
  applyRead,
  applyToConversations,
  markReadLocally,
  replaceMessage,
  type ChatMessageChangedEvent,
  type ChatReadEvent,
  type ChatBadgeEvent,
  type ChatConversation,
  type ChatMessage,
  type ChatMessageEvent,
} from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { useSocketContext } from "@/contexts/socket-context"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { chatViewing } from "./chat-viewing"

export type Thread = { data: ChatMessage[]; hasMore: boolean }

/**
 * Chat on the socket, put in place — never reloaded.
 *
 * A message used to make every open screen download the conversation list and
 * the open thread again. The event now carries the message and this person's
 * own numbers, and the caches are patched where they stand. Only a thread this
 * screen has never listed, or a reconnect (events may have been missed), reads
 * again.
 */
export function useChatLive(opts: {
  enabled: boolean
  meId?: string | null
  onIncoming?: (evt: ChatMessageEvent) => void
}) {
  const qc = useQueryClient()
  const { subscribe, isConnected } = useSocketContext()
  const live = useRef(opts)
  live.current = opts

  useEffect(() => {
    if (!opts.enabled || !isConnected) return
    // Back online: anything said while disconnected was not on this socket.
    qc.invalidateQueries({ queryKey: keys.chat.conversations() })
    qc.invalidateQueries({ queryKey: keys.chat.badge() })

    const offMessage = subscribe<ChatMessageEvent>(SocketEvents.CHAT_MESSAGE, (evt) => {
      if (!evt?.conversationId) return
      const { meId, onIncoming } = live.current
      const viewingId = chatViewing.id
      let known = true
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) => {
        if (!list) return list
        const next = applyToConversations(list, evt, { meId, openId: viewingId })
        known = next.known
        return next.list
      })
      if (!known) qc.invalidateQueries({ queryKey: keys.chat.conversations() })
      if (evt.message?.id) {
        qc.setQueryData<Thread>(keys.chat.thread(evt.conversationId), (old) =>
          old ? { ...old, data: appendMessage(old.data, evt.message) } : old,
        )
      }
      if (typeof evt.badge === "number") qc.setQueryData(keys.chat.badge(), { total: evt.badge })
      else qc.invalidateQueries({ queryKey: keys.chat.badge() })
      onIncoming?.(evt)
    })
    const offBadge = subscribe<ChatBadgeEvent>(SocketEvents.CHAT_BADGE, (evt) => {
      if (Number.isInteger(evt?.total)) qc.setQueryData(keys.chat.badge(), { total: evt.total })
    })
    // "Read" under what I wrote: the reader's time moves in the list row.
    const offRead = subscribe<ChatReadEvent>(SocketEvents.CHAT_READ, (evt) => {
      if (!evt?.conversationId) return
      // Read by me on another screen or device: the row's number goes too.
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list ? applyRead(list, evt, live.current.meId) : list,
      )
    })
    // An edit or a removal: the thread and the list row take the new copy.
    const offChanged = subscribe<ChatMessageChangedEvent>(SocketEvents.CHAT_MESSAGE_CHANGED, (evt) => {
      if (!evt?.message?.id) return
      qc.setQueryData<Thread>(keys.chat.thread(evt.conversationId), (old) =>
        old ? { ...old, data: replaceMessage(old.data, evt.message) } : old,
      )
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list ? applyChangedToConversations(list, evt) : list,
      )
    })
    // A group changed, or a job's crew moved: the list (members, names) is read again.
    // Somebody taken out sees the thread leave their list; the open screen follows it.
    const offMembers = subscribe<{ conversationId?: string; removed?: boolean }>(
      SocketEvents.CHAT_CONVERSATION_UPDATED,
      (evt) => {
        if (!evt?.conversationId) return
        if (evt.removed) {
          qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
            list?.filter((c) => c.id !== evt.conversationId),
          )
          qc.removeQueries({ queryKey: keys.chat.thread(evt.conversationId) })
        }
        qc.invalidateQueries({ queryKey: keys.chat.conversations() })
        qc.invalidateQueries({ queryKey: keys.chat.badge() })
      },
    )
    return () => {
      offMessage()
      offBadge()
      offRead()
      offChanged()
      offMembers()
    }
  }, [opts.enabled, isConnected, subscribe, qc])
}

/** The unread total for the top-bar button. Kept fresh by the socket; read after the page's first load. */
export function useChatBadge(enabled: boolean) {
  const afterFirstLoad = useAfterFirstLoad(1)
  const { data } = useQuery({
    queryKey: keys.chat.badge(),
    queryFn: chatApi.badge,
    enabled: enabled && afterFirstLoad,
    staleTime: 5 * 60_000,
  })
  return data?.total ?? 0
}

/**
 * THE way the web marks a thread read: its row reads 0 at once, and the badge
 * takes the server's answer — the caller's TRUE unread total — so reading always
 * corrects a badge that drifted, whatever the socket did or missed.
 */
export function useMarkRead() {
  const qc = useQueryClient()
  return (conversationId: string) => {
    qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
      list ? markReadLocally(list, conversationId) : list,
    )
    chatApi.markRead(conversationId).then((r) => {
      if (r && Number.isInteger(r.total)) qc.setQueryData(keys.chat.badge(), { total: r.total })
    }).catch(() => {})
  }
}
