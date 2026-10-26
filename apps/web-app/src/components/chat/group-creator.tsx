"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { toast } from "sonner"
import {
  CHAT_GROUP_MAX_MEMBERS,
  CHAT_GROUP_TITLE_MAX,
  parseGroupTitle,
  type ChatConversation,
} from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { ContactsPicker } from "./contacts-picker"

/**
 * Start a group: a name and the people in it. Offered only to who may start one
 * (managers and leaders — GET /chat/capabilities); the picker lists only people
 * the caller may message, the same rule the server asks of each.
 */
export function GroupCreator({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: ChatConversation) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const create = useMutation({
    mutationFn: () => chatApi.createGroup(parseGroupTitle(title) ?? "", [...picked]),
    onSuccess: (conv) => {
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list && !list.some((c) => c.id === conv.id) ? [conv, ...list] : list,
      )
      onCreated(conv)
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else if (next.size + 1 < CHAT_GROUP_MAX_MEMBERS) next.add(id)
      return next
    })
  const ready = !!parseGroupTitle(title) && picked.size > 0

  return (
    <div className="motion-sheet-in flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <GradientIcon name="people" size={20} />
          {t("chat.newGroup", "New group")}
        </span>
        <button
          type="button"
          className="icon-motion rounded-full p-1 hover:bg-muted"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
        >
          <GradientIcon name="xLine" size={18} flat />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-border p-3">
        <input
          autoFocus
          value={title}
          maxLength={CHAT_GROUP_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("chat.groupName", "Group name")}
          aria-label={t("chat.groupName", "Group name")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <button
          type="button"
          disabled={!ready || create.isPending}
          onClick={() => create.mutate()}
          className={
            "flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-sky-500 " +
            "via-blue-500 to-indigo-500 px-3.5 py-2 text-sm font-medium text-white " +
            "shadow-sm shadow-blue-500/30 transition active:scale-95 " +
            "disabled:opacity-50"
          }
        >
          {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {t("chat.createGroup", { count: picked.size, defaultValue: "Create ({{count}})" })}
        </button>
      </div>
      <ContactsPicker onPick={toggle} picking={create.isPending} selected={picked} />
    </div>
  )
}
