"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { toast } from "sonner"
import { conversationTitle, type ChatConversation } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { useAuth } from "@/contexts/auth-context"
import { ConversationList } from "./conversation-list"
import { ContactsPicker } from "./contacts-picker"
import { ChatThread } from "./chat-thread"
import { ThreadHeader } from "./thread-header"
import { PersonPanel } from "./person-panel"
import { GroupCreator } from "./group-creator"
import { GroupPanel } from "./group-panel"
import { MessageSearch } from "./message-search"

/**
 * Messages — every conversation, one open, and the person (or the group) beside it.
 * `?c=<conversationId>` opens a conversation, `?with=<userId>` opens (or
 * starts) the one with that person, `?task=<taskId>` a job's chat; the address
 * always names what is open, so Back and a shared link work.
 */
export function MessagesView() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const activeId = params.get("c")
  const withUser = params.get("with")
  const withTask = params.get("task")
  const [picking, setPicking] = useState<false | "direct" | "group">(false)
  const [query, setQuery] = useState("")

  const { data: conversations } = useQuery({
    queryKey: keys.chat.conversations(),
    queryFn: chatApi.conversations,
    staleTime: 60_000,
  })
  const { data: caps } = useQuery({
    queryKey: keys.chat.capabilities(),
    queryFn: chatApi.capabilities,
    staleTime: 5 * 60_000,
  })
  const open = (id: string | null) => router.replace(id ? `/messages?c=${encodeURIComponent(id)}` : "/messages")

  const openDM = useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: (conv) => {
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list && !list.some((c) => c.id === conv.id) ? [conv, ...list] : list,
      )
      setPicking(false)
      open(conv.id)
    },
    onError: (err) => {
      toast.error((err as Error)?.message || t("chat.couldNotOpen", "Could not open that conversation"))
      open(null)
    },
  })
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!withUser || opened.current === withUser) return
    opened.current = withUser
    openDM.mutate(withUser)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withUser])

  // A job's chat, from the job page: opened (or created) for its crew and the office.
  const openTask = useMutation({
    mutationFn: (taskId: string) => chatApi.openTask(taskId),
    onSuccess: (conv) => {
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list && !list.some((c) => c.id === conv.id) ? [conv, ...list] : list,
      )
      open(conv.id)
    },
    onError: (err) => {
      toast.error((err as Error)?.message || t("chat.couldNotOpen", "Could not open that conversation"))
      open(null)
    },
  })
  const openedTask = useRef<string | null>(null)
  useEffect(() => {
    if (!withTask || openedTask.current === withTask) return
    openedTask.current = withTask
    openTask.mutate(withTask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withTask])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !conversations) return conversations
    return conversations.filter((c) =>
      `${conversationTitle(c, i18n.language)} ${c.lastMessage?.body ?? ""}`.toLowerCase().includes(q),
    )
  }, [conversations, query, i18n.language])
  const active = activeId
    ? (conversations?.find((c) => c.id === activeId) ??
      [openDM.data, openTask.data].find((c) => c?.id === activeId) ??
      null)
    : null

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-background">
      <div
        className={`flex w-full flex-col border-r border-border md:w-80 md:shrink-0 ${active || picking ? "hidden md:flex" : "flex"}`}
      >
        <div className="flex items-center gap-2 border-b border-border p-2.5">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <GradientIcon name="searchLine" size={16} flat />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chat.searchConversations", "Search conversations")}
              aria-label={t("chat.searchConversations", "Search conversations")}
              className={"w-full rounded-full border border-border bg-muted py-1.5 pl-9 pr-3 " +
                "text-sm outline-none " +
                "transition-[border-color,background-color,box-shadow] duration-200 " +
                "focus:border-blue-400 focus:bg-background " +
                "focus:shadow-[0_0_0_4px_rgb(59_130_246/0.15)]"}
            />
          </div>
          {caps?.mayCreateGroup && (
            <button
              type="button"
              onClick={() => setPicking("group")}
              aria-label={t("chat.newGroup", "New group")}
              title={t("chat.newGroup", "New group")}
              className={"icon-motion flex size-9 items-center justify-center rounded-full " +
                "transition-colors hover:bg-blue-500/10 active:scale-90"}
            >
              <GradientIcon name="group" size={22} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setPicking("direct")}
            aria-label={t("chat.newMessage", "New message")}
            title={t("chat.newMessage", "New message")}
            className={"icon-motion flex size-9 items-center justify-center rounded-full " +
              "transition-colors hover:bg-blue-500/10 active:scale-90"}
          >
            <GradientIcon name="compose" size={22} />
          </button>
        </div>
        <ConversationList
          conversations={shown}
          onOpen={(id) => {
            setPicking(false)
            open(id)
          }}
          onNew={() => setPicking("direct")}
          activeId={activeId}
        />
        {query.trim().length >= 2 && (
          <div className="max-h-[55%] shrink-0 overflow-y-auto">
            <MessageSearch
              query={query}
              onOpen={(id) => {
                setPicking(false)
                open(id)
              }}
            />
          </div>
        )}
      </div>

      <section className={`min-w-0 flex-1 flex-col ${active || picking ? "flex" : "hidden md:flex"}`}>
        {picking === "group" ? (
          <GroupCreator
            onClose={() => setPicking(false)}
            onCreated={(c) => {
              setPicking(false)
              open(c.id)
            }}
          />
        ) : picking ? (
          <div className="motion-sheet-in flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <GradientIcon name="compose" size={20} />
                {t("chat.newMessage", "New message")}
              </span>
              <button
                type="button"
                className="icon-motion rounded-full p-1 hover:bg-muted"
                onClick={() => setPicking(false)}
                aria-label={t("common.close", "Close")}
              >
                <GradientIcon name="xLine" size={18} flat />
              </button>
            </div>
            <ContactsPicker onPick={(uid) => openDM.mutate(uid)} picking={openDM.isPending} />
          </div>
        ) : active && user ? (
          // Keyed on the conversation: opening another one slides it in.
          <div key={active.id} className="motion-thread-in flex min-h-0 flex-1 flex-col">
            <ThreadHeader conversation={active} onBack={() => open(null)} />
            <ChatThread conversation={active} meId={user.id} />
          </div>
        ) : openDM.isPending || openTask.isPending || (activeId && !conversations) ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div
              className={"flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br " +
                "from-sky-50 to-indigo-50 dark:from-sky-500/10 dark:to-indigo-500/10"}>
              <GradientIcon name="chat" size={34} />
            </div>
            <p className="text-sm text-muted-foreground">
              {t("chat.pick", "Choose a conversation, or start a new one.")}
            </p>
          </div>
        )}
      </section>

      {active &&
        !picking &&
        user &&
        (active.type === "DIRECT" ? (
          <PersonPanel person={active.otherMember} />
        ) : (
          <GroupPanel conversation={active} meId={user.id} onLeft={() => open(null)} />
        ))}
    </div>
  )
}
