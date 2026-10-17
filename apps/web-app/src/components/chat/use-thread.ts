"use client"

import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  appendMessage,
  historyCursor,
  replaceMessage,
  type ChatAttachment,
  type ChatMessage,
} from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import type { Thread } from "./use-chat-live"

export type Shown = ChatMessage & { pending?: boolean }

/**
 * One conversation's messages: the newest page, older pages on request, and
 * sending, editing and removing — each drawn at once and replaced by the
 * server's copy (the same id), never added twice.
 */
export function useThread(conversationId: string, meId: string) {
  const qc = useQueryClient()
  const key = keys.chat.thread(conversationId)
  const { data } = useQuery({ queryKey: key, queryFn: () => chatApi.history(conversationId) })
  const messages: Shown[] = data?.data ?? []
  const [loadingOlder, setLoadingOlder] = useState(false)

  /** The page before the oldest one on screen, by (createdAt, id) — never a skipped or repeated message. */
  const loadOlder = useCallback(async () => {
    const current = qc.getQueryData<Thread>(key)
    if (!current?.hasMore || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await chatApi.history(conversationId, historyCursor(current.data[0]))
      qc.setQueryData<Thread>(
        key,
        (old) =>
          old && {
            data: [...page.data.filter((m) => !old.data.some((o) => o.id === m.id)), ...old.data],
            hasMore: page.hasMore,
          },
      )
    } finally {
      setLoadingOlder(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, loadingOlder, qc])

  const send = useMutation({
    mutationFn: (m: { id: string; body: string; attachments: ChatAttachment[] }) =>
      chatApi.send(conversationId, m.body, m.id, m.attachments),
    onMutate: async ({ id, body, attachments }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Thread>(key)
      const optimistic: Shown = {
        id,
        conversationId,
        senderId: meId,
        body,
        attachments,
        createdAt: new Date().toISOString(),
        pending: true,
      }
      qc.setQueryData<Thread>(key, {
        data: appendMessage(prev?.data ?? [], optimistic),
        hasMore: prev?.hasMore ?? false,
      })
      return { prev }
    },
    onSuccess: (saved) =>
      qc.setQueryData<Thread>(key, (old) => old && { ...old, data: replaceMessage(old.data, saved) }),
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })

  const put = (saved: ChatMessage) =>
    qc.setQueryData<Thread>(key, (old) => old && { ...old, data: replaceMessage(old.data, saved) })
  const edit = useMutation({
    mutationFn: (m: { id: string; body: string }) => chatApi.edit(m.id, m.body),
    onSuccess: put,
  })
  const remove = useMutation({ mutationFn: (id: string) => chatApi.remove(id), onSuccess: put })

  return { messages, hasMore: !!data?.hasMore, loadOlder, loadingOlder, send, edit, remove }
}
