"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { personName, chatPresenceLabel, type ChatUserRef } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { ChatAvatar } from "./chat-avatar"

/**
 * The person on the other side, beside the conversation: what Team knows about
 * them (GET /people/:id — never more than Team shows), and their full page for
 * whoever may open it.
 */
export function PersonPanel({ person }: { person: ChatUserRef | null | undefined }) {
  const { t } = useTranslation()
  const { may } = useRouteAccess()
  const id = person?.id
  const { data } = useQuery({
    queryKey: keys.people.person(id ?? ""),
    queryFn: () => chatApi.person(id!),
    enabled: !!id && !person?.isExternal,
    staleTime: 60_000,
    retry: false,
  })
  if (!person) return null
  const who = { ...person, ...(data ?? {}) }
  return (
    <aside
      key={person.id}
      className="motion-panel-in hidden w-64 shrink-0 flex-col gap-3 border-l border-border p-4 lg:flex"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ChatAvatar u={who} size={64} />
        <div>
          <p className="font-semibold text-foreground">{personName(who)}</p>
          {who.position && <p className="text-xs text-muted-foreground">{who.position}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("chat.status", "Status")}</dt>
        <dd>
          {person.isExternal ? t("chat.externalMember", "At another organization") : chatPresenceLabel(who.presence, t)}
        </dd>
        {!!data?.workspaces?.length && (
          <>
            <dt className="text-muted-foreground">{t("chat.workspaces", "Workspaces")}</dt>
            <dd className="[overflow-wrap:anywhere]">{data.workspaces.join(", ")}</dd>
          </>
        )}
      </dl>
      {may(`/members/${person.id}`) && (
        <Link
          href={`/members/${person.id}`}
          className="rounded-lg border border-border px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
        >
          {t("chat.openProfile", "Open profile")}
        </Link>
      )}
    </aside>
  )
}
