"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { personName } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { ChatAvatar, ChatTag } from "./chat-avatar"

/**
 * Choose who to write to: only people the server says may be reached.
 * With `selected`, it picks SEVERAL (a group): a tap toggles, `exclude` hides
 * people already in it, and another company's people are not offered — a
 * group is one company's.
 */
export function ContactsPicker({
  onPick,
  picking,
  selected,
  exclude,
}: {
  onPick: (userId: string) => void
  picking: boolean
  selected?: ReadonlySet<string>
  exclude?: ReadonlySet<string>
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState("")
  const { data: contacts, isLoading } = useQuery({ queryKey: keys.chat.contacts(), queryFn: chatApi.contacts })
  const needle = q.trim().toLowerCase()
  const multi = !!selected
  const filtered = (contacts ?? []).filter(
    (u) => personName(u).toLowerCase().includes(needle) && !exclude?.has(u.id) && !(multi && u.isExternal),
  )
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <GradientIcon name="searchLine" size={16} flat />
          </span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("chat.searchContacts", "Search people…")}
            aria-label={t("chat.searchContacts", "Search people…")}
            className={"w-full rounded-full border border-border bg-muted py-2 pl-9 pr-3 text-sm " +
              "outline-none transition-colors focus:border-blue-400 focus:bg-background"}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length ? (
          filtered.map((u, i) => (
            <button
              key={u.id}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              disabled={picking}
              onClick={() => onPick(u.id)}
              aria-pressed={multi ? selected!.has(u.id) : undefined}
              className={"motion-stagger flex w-full items-center gap-3 rounded-xl px-2.5 py-2 " +
                "text-left transition-colors hover:bg-accent disabled:opacity-50"}
            >
              <ChatAvatar u={u} size={38} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{personName(u)}</span>
                  {/* Where you PICK who to talk to, someone at another company must not look like a colleague. */}
                  {u.isExternal && <ChatTag kind="external" small />}
                </span>
                {u.position && <span className="block truncate text-xs text-muted-foreground">{u.position}</span>}
              </span>
              {multi && (
                <span
                  className={(`flex size-5 shrink-0 items-center justify-center rounded-full border ` +
                    `transition-colors duration-200 ` +
                    `${selected!.has(
                    u.id)
                    ? ("border-transparent bg-gradient-to-br from-sky-400 to-indigo-500 " + "text-white")
                    : "border-border"}`)}
                >
                  {selected!.has(u.id) && <Check className="motion-chip size-3.5" />}
                </span>
              )}
            </button>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("chat.noContacts", "No one to message.")}
          </p>
        )}
      </div>
    </div>
  )
}
