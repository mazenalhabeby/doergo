"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { MessageCircle, Phone, Users } from "lucide-react"
import { teamApi } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { notify } from "@/lib/toast"

export default function TeamPage() {
  const { t } = useTranslation()
  const { data: colleagues = [], isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: () => teamApi.list(),
    staleTime: 60000,
  })

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-foreground">{t("team.title")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("team.subtitle")}</p>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : colleagues.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-14 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {colleagues.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <UserAvatar firstName={c.firstName} lastName={c.lastName} avatarUrl={c.avatarUrl} seed={c.id} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.position || t("members.roles.employee")}{c.spaceName ? ` · ${c.spaceName}` : ""}
                </p>
              </div>
              <button
                onClick={() => notify.success(t("workspace.messagingComingSoon"))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={() => notify.success(t("team.callsComingSoon"))}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:text-foreground"
              >
                <Phone className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
