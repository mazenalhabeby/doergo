"use client"
import type { TFunction } from "i18next"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Phone, MessageSquare } from "lucide-react"
import { organizationsApi, type OrgMember } from "@/lib/api"
import { notify } from "@/lib/toast"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { useContactActions } from "@/hooks/use-contact-actions"

const PRESENCE: Record<string, { color: string; key: string; def: string }> = {
  AVAILABLE: { color: "bg-green-500", key: "presence.available", def: "Available" },
  BUSY: { color: "bg-red-500", key: "presence.busy", def: "Busy" },
  AWAY: { color: "bg-amber-500", key: "presence.away", def: "Away" },
}

const ONLINE_MS = 3 * 60 * 1000

function isOnline(iso?: string | null): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < ONLINE_MS
}

/** "Online" / "Active 5m ago" / "Active 2h ago" — a compact last-seen label. */
function lastActiveLabel(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return ""
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 3) return t("presence.online", "Online")
  const unit = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`
  return t("presence.activeAgo", "Active {{time}} ago", { time: unit })
}

/**
 * Best-practice contact strip: reach your org's admins/managers from anywhere,
 * independent of space membership (admins aren't assigned to a work location).
 * Shows each with live presence + Message/Call. Shares the dashboard's member
 * query (no extra fetch).
 */
export function ManagementContacts() {
  const { message, canMessage } = useContactActions()
  const { t } = useTranslation()

  // Contacts endpoint is accessible to ANY member (unlike /members, which needs
  // canManageUsers) — so employees can see their admins/managers.
  const { data } = useQuery({
    queryKey: ["orgContacts"],
    queryFn: () => organizationsApi.getContacts(),
    staleTime: 60_000,
    // Online dots are computed client-side from lastActiveAt vs a 3-min window;
    // refetch so a continuously-open list self-heals instead of aging out.
    refetchInterval: 60_000,
  })

  // Only people there is actually a conversation to open with — same rule the
  // chat itself applies, asked rather than restated.
  const managers = ((data ?? []) as OrgMember[]).filter((m) => canMessage(m.id))
  if (managers.length === 0) return null

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("dashboard.management.title", "Management")}</h2>
      <div className="grid grid-cols-1 gap-2.5">
        {managers.map((m) => {
          const p = m.presence ? PRESENCE[m.presence] : null
          const online = isOnline(m.lastActiveAt)
          const name = `${m.firstName} ${m.lastName ?? ""}`.trim()
          // Show the member's job title/position only — never the ADMIN/EMPLOYEE
          // permission role as an identity label.
          const positionLabel = m.position?.trim() || ""
          // Dot: manual presence wins; otherwise green when recently active, grey when not.
          const dotClass = p ? p.color : online ? "bg-green-500" : "bg-muted-foreground/40"
          // Status text: manual presence label, else the online/last-seen label.
          const statusText = p ? t(p.key, p.def) : lastActiveLabel(m.lastActiveAt, t)
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-sm"
            >
              <div className="relative shrink-0">
                <UserAvatar firstName={m.firstName} lastName={m.lastName} avatarUrl={m.avatarUrl} seed={m.id} size="md" />
                <span
                  className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card", dotClass)}
                  title={statusText || t("presence.available", "Available")}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[positionLabel, statusText].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => message(m.id)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t("workspace.message", "Message")}
                >
                  <MessageSquare className="size-4" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => notify.success(t("workspace.voiceCallComingSoon"))}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t("workspace.voiceCall", "Call")}
                >
                  <Phone className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
