"use client"

import { useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { conversationTitle, chatRelTime, type ChatConversation } from "@hbcfield/shared/client"
import { ChatTag, ConversationAvatar } from "./chat-avatar"

/** Every conversation the person has, newest first, with what is unread. */
export function ConversationList({
  conversations,
  onOpen,
  onNew,
  activeId,
}: {
  conversations?: ChatConversation[]
  onOpen: (id: string) => void
  onNew: () => void
  activeId?: string | null
}) {
  const { t, i18n } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  useFlip(listRef, (conversations ?? []).map((c) => c.id).join("|"))
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {conversations === undefined ? (
          <ListSkeleton />
        ) : conversations.length > 0 ? (
          <div ref={listRef} className="relative p-1.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                data-flip={c.id}
                onClick={() => onOpen(c.id)}
                aria-current={c.id === activeId ? "true" : undefined}
                className={(`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 ` +
                  `text-left transition-colors duration-200 hover:bg-accent ` +
                  `${c.id === activeId
                  ? "motion-marker bg-blue-500/10"
                  : ""}`)}
              >
                <ConversationAvatar c={c} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`truncate text-sm text-foreground ${c.unread ? "font-semibold" : "font-medium"}`}
                      >
                        {conversationTitle(c, i18n.language)}
                      </span>
                      {c.isExternal && <ChatTag kind="external" small />}
                      {c.isClosed && <ChatTag kind="closed" small />}
                      {c.mutedUntil && Date.parse(c.mutedUntil) > Date.now() && (
                        <span className="text-muted-foreground">
                          <GradientIcon name="bellOff" size={13} flat label={t("chat.muted", "Notifications off")} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {chatRelTime(c.lastMessageAt, i18n.language)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-[13px] text-muted-foreground ${c.unread ? "font-medium" : ""}`}>
                      {c.lastMessage?.body ?? t("chat.noMessages", "No messages yet")}
                    </span>
                    {!!c.unread && <UnreadBadge count={c.unread} />}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div
              className={"flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br " +
                "from-sky-50 to-indigo-50 dark:from-sky-500/10 dark:to-indigo-500/10"}>
              <GradientIcon name="chat" size={30} />
            </div>
            <p className="text-sm text-muted-foreground">{t("chat.empty", "No conversations yet.")}</p>
            <button
              onClick={onNew}
              className={"rounded-xl bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 " +
                "px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-500/30 " +
                "transition active:scale-95"}
            >
              {t("chat.newMessage", "New message")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The unread count; it pops when it changes while on screen (not when the list first draws). */
function UnreadBadge({ count }: { count: number }) {
  const first = useRef(count)
  const changed = count !== first.current
  return (
    <span
      key={changed ? count : "first"}
      className={(`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full ` +
        `bg-gradient-to-br from-blue-500 to-indigo-500 px-1.5 text-[10px] ` +
        `font-bold tabular-nums text-white ` +
        `${changed
        ? "motion-bump"
        : ""}`)}
    >
      {count}
    </span>
  )
}

/**
 * Rows glide to their new places when the order changes (a conversation with a
 * new message jumps to the top) instead of jumping. Positions are read with
 * offsetTop — relative to the list — so scrolling never reads as a move.
 */
function useFlip(ref: React.RefObject<HTMLElement | null>, order: string) {
  const last = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const now = new Map<string, number>()
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => now.set(n.dataset.flip!, n.offsetTop))
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!calm) {
      el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => {
        const was = last.current.get(n.dataset.flip!)
        const dy = was === undefined ? 0 : was - n.offsetTop
        if (dy)
          n.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
            duration: 420,
            easing: "cubic-bezier(.2,.8,.2,1)",
          })
      })
    }
    last.current = now
  }, [ref, order])
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
