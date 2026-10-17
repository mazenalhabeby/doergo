"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { toast } from "sonner"
import {
  CHAT_GROUP_TITLE_MAX,
  conversationTitle,
  parseGroupTitle,
  personName,
  type ChatConversation,
} from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { ChatAvatar, ConversationAvatar } from "./chat-avatar"
import { ContactsPicker } from "./contacts-picker"

/**
 * Beside a group or a job's chat: who is in it, and — for whoever may manage
 * the group (its creator, or a manager) — rename, add, take out. Anybody may
 * leave a group. A job's chat follows its crew, so it has nothing to change
 * here; it links to the job instead.
 */
export function GroupPanel({
  conversation,
  meId,
  onLeft,
}: {
  conversation: ChatConversation
  meId: string
  onLeft: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // The person being taken out slides away first; the list changes when they have gone.
  const [leaving, setLeaving] = useState<string | null>(null)
  const isGroup = conversation.type === "GROUP"
  const manage = isGroup && !!conversation.canManage
  const members = conversation.members ?? []

  // Every change answers with the conversation: put it in the list where it stands.
  const put = (c: ChatConversation) =>
    qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
      list?.map((x) => (x.id === c.id ? { ...x, ...c } : x)),
    )
  const onError = (e: unknown) => toast.error((e as Error).message)
  const rename = useMutation({
    mutationFn: (title: string) => chatApi.renameGroup(conversation.id, title),
    onSuccess: (c) => {
      put(c)
      setRenaming(null)
    },
    onError,
  })
  const add = useMutation({
    mutationFn: () => chatApi.addMembers(conversation.id, [...picked]),
    onSuccess: (c) => {
      put(c)
      setAdding(false)
      setPicked(new Set())
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => chatApi.removeMember(conversation.id, userId),
    onSuccess: put,
    onError,
  })
  const leave = useMutation({
    mutationFn: () => chatApi.leaveGroup(conversation.id),
    onSuccess: () => {
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list?.filter((x) => x.id !== conversation.id),
      )
      onLeft()
    },
    onError,
  })
  const askLeave = () =>
    toast(t("chat.leaveAsk", "Leave this group? You will no longer see its messages."), {
      action: { label: t("chat.leave", "Leave"), onClick: () => leave.mutate() },
    })
  const askRemove = (id: string, name: string) =>
    toast(t("chat.removeMemberAsk", { name, defaultValue: "Take {{name}} out of this group?" }), {
      action: {
        label: t("chat.removeMember", "Take out"),
        onClick: () => {
          setLeaving(id)
          window.setTimeout(() => remove.mutate(id, { onSettled: () => setLeaving(null) }), 320)
        },
      },
    })

  if (adding) {
    return (
      <aside className="motion-panel-in hidden w-72 shrink-0 flex-col border-l border-border lg:flex">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">{t("chat.addPeople", "Add people")}</span>
          <button
            type="button"
            className="icon-motion rounded-full p-1 hover:bg-muted"
            onClick={() => {
              setAdding(false)
              setPicked(new Set())
            }}
            aria-label={t("common.close", "Close")}
          >
            <GradientIcon name="xLine" size={18} flat />
          </button>
        </div>
        <ContactsPicker
          picking={add.isPending}
          selected={picked}
          exclude={new Set(members.map((m) => m.id))}
          onPick={(id) =>
            setPicked((s) => {
              const n = new Set(s)
              if (n.has(id)) n.delete(id)
              else n.add(id)
              return n
            })
          }
        />
        <div className="border-t border-border p-3">
          <button
            type="button"
            disabled={!picked.size || add.isPending}
            onClick={() => add.mutate()}
            className="w-full rounded-lg bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-blue-500/30 transition active:scale-95 disabled:opacity-50"
          >
            {t("chat.addCount", { count: picked.size, defaultValue: "Add ({{count}})" })}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      key={conversation.id}
      className="motion-panel-in hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 lg:flex"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ConversationAvatar c={conversation} size={64} />
        {renaming !== null ? (
          <form
            className="flex w-full items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              const v = parseGroupTitle(renaming)
              if (v) rename.mutate(v)
            }}
          >
            <input
              autoFocus
              value={renaming}
              maxLength={CHAT_GROUP_TITLE_MAX}
              onChange={(e) => setRenaming(e.target.value)}
              aria-label={t("chat.groupName", "Group name")}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!parseGroupTitle(renaming) || rename.isPending}
              aria-label={t("common.save", "Save")}
              className="icon-motion rounded p-1 disabled:opacity-40"
            >
              <GradientIcon name="check" size={20} />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(null)}
              aria-label={t("common.cancel", "Cancel")}
              className="icon-motion rounded p-1 text-muted-foreground"
            >
              <GradientIcon name="xLine" size={18} flat />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1">
            <p className="font-semibold text-foreground [overflow-wrap:anywhere]">
              {conversationTitle(conversation, i18n.language)}
            </p>
            {manage && (
              <button
                type="button"
                onClick={() => setRenaming(conversation.title ?? "")}
                aria-label={t("chat.rename", "Rename")}
                title={t("chat.rename", "Rename")}
                className="icon-motion rounded p-1 hover:bg-muted"
              >
                <GradientIcon name="edit" size={16} />
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {conversation.type === "TASK"
            ? t("chat.taskChatNote", "Everyone on this job's crew is in this chat.")
            : t("chat.peopleCount", { count: members.length, defaultValue: "{{count}} people" })}
        </p>
      </div>

      {conversation.type === "TASK" && conversation.task && (
        <Link
          href={`/tasks/${conversation.task.id}`}
          className="icon-motion flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-center text-xs font-medium transition-colors hover:bg-muted"
        >
          <GradientIcon name="job" size={16} />
          {t("chat.openJob", "Open the job")}
        </Link>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t("chat.members", "Members")}</span>
          {manage && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="icon-motion flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"
            >
              <GradientIcon name="addUser" size={16} />
              {t("chat.addPeople", "Add people")}
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {members.map((m) => (
            <li
              key={m.id}
              className={`group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60 ${leaving === m.id ? "motion-leave" : ""}`}
            >
              <ChatAvatar u={m} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">
                  {m.id === meId ? t("chat.you", "You") : personName(m)}
                </span>
                {m.id === conversation.createdById && isGroup && (
                  <span className="block text-[10.5px] text-muted-foreground">
                    {t("chat.groupOwner", "Manages the group")}
                  </span>
                )}
              </span>
              {manage && m.id !== meId && (
                <button
                  type="button"
                  onClick={() => askRemove(m.id, personName(m))}
                  aria-label={t("chat.removeMember", "Take out")}
                  title={t("chat.removeMember", "Take out")}
                  className="icon-motion rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <GradientIcon name="userMinus" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isGroup && (
        <button
          type="button"
          onClick={askLeave}
          disabled={leave.isPending}
          className="icon-motion mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <GradientIcon name="leave" size={16} />
          {t("chat.leaveGroup", "Leave the group")}
        </button>
      )}
    </aside>
  )
}
