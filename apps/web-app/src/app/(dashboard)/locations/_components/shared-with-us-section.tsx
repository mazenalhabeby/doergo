"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { spaceSharingApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Chip, GroupLabel, Panel, ROW } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { LEVEL_TONE } from "./space-card"

export function SharedWithUsSection() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()

  // Active shared spaces come from the auth context (no fetch). Pending invites
  // are fetched: /shared-spaces returns both PENDING and ACTIVE — filter here.
  const activeShared = user?.access?.sharedSpaces || []

  const { data: sharedSpaces } = useQuery({
    queryKey: keys.sharedSpaces.list(),
    queryFn: () => spaceSharingApi.listSharedSpaces(),
  })
  const pending = (sharedSpaces || []).filter((s) => s.status === "PENDING")

  const respondMutation = useMutation({
    mutationFn: ({ shareId, accept }: { shareId: string; accept: boolean }) =>
      spaceSharingApi.respondToShare(shareId, accept),
    onSuccess: (_res, { accept }) => {
      queryClient.invalidateQueries({ queryKey: keys.sharedSpaces.list() })
      // Full access (auth context sharedSpaces) refreshes after /auth/me reloads.
      if (accept) void refreshUser()
      notify.success(accept ? t("spaceSharing.toast.inviteAccepted") : t("spaceSharing.toast.inviteDeclined"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.respondFailed")),
  })

  if (pending.length === 0 && activeShared.length === 0) return null

  return (
    <div className="mb-5 flex flex-col gap-3.5">
      {/* Pending invites — the board's accent band: what is asked, then the two answers. */}
      {pending.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-wrap items-center gap-3.5 rounded-[18px] bg-shell-accent-soft px-[18px] py-4"
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <p className="text-[15px] font-semibold text-foreground">
              {t("spaceSharing.guest.inviteTitle", { space: invite.spaceName, org: invite.ownerOrgName })}
            </p>
            <p className="text-[13px] text-muted-foreground">{t(`spaceSharing.levels.${invite.level}.description`)}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3.5 text-[13px]"
            onClick={() => respondMutation.mutate({ shareId: invite.id, accept: false })}
            disabled={respondMutation.isPending}
          >
            {t("spaceSharing.guest.decline")}
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-full px-3.5 text-[13px]"
            onClick={() => respondMutation.mutate({ shareId: invite.id, accept: true })}
            disabled={respondMutation.isPending}
          >
            {t("spaceSharing.guest.accept")}
          </Button>
        </div>
      ))}

      {/* Active shared spaces — one list in a panel, a row per workspace. */}
      {activeShared.length > 0 && (
        <Panel className="p-1.5">
          <GroupLabel>{t("spaceSharing.guest.sharedWithUs")}</GroupLabel>
          {activeShared.map((s) => (
            <button
              key={s.spaceId}
              type="button"
              onClick={() => router.push(`/shared/${s.spaceId}`)}
              className={cn(ROW, "items-center")}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-shell-accent-soft text-shell-accent">
                <Icon name="workspaces" size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[14.5px] font-semibold text-foreground">{s.spaceName}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="accent">{t("spaceSharing.guest.sharedFrom", { org: s.ownerOrgName })}</Chip>
                  <Chip tone={LEVEL_TONE[s.level] ?? "soft"}>{t(`spaceSharing.levels.${s.level}.label`)}</Chip>
                </span>
              </span>
              <Icon name="chevronRight" size={16} className="text-muted-foreground" />
            </button>
          ))}
        </Panel>
      )}
    </div>
  )
}
