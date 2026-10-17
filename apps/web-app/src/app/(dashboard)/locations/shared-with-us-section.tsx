"use client"

import { keys } from "@/lib/query-keys"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronRight, Handshake, Share2, Check, X } from "lucide-react"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { spaceSharingApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SpaceForm } from "./_components/space-form"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LEVEL_BADGE } from "./space-card"

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
    <div className="mb-8 space-y-6">
      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                  <Share2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t("spaceSharing.guest.inviteTitle", { space: invite.spaceName, org: invite.ownerOrgName })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`spaceSharing.levels.${invite.level}.description`)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => respondMutation.mutate({ shareId: invite.id, accept: true })}
                  disabled={respondMutation.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("spaceSharing.guest.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => respondMutation.mutate({ shareId: invite.id, accept: false })}
                  disabled={respondMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("spaceSharing.guest.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active shared spaces */}
      {activeShared.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t("spaceSharing.guest.sharedWithUs")}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeShared.map((s) => (
              <button
                key={s.spaceId}
                type="button"
                onClick={() => router.push(`/shared/${s.spaceId}`)}
                className="text-left rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground truncate">{s.spaceName}</h3>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="gap-1 text-xs font-medium border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        <Handshake className="h-3 w-3" />
                        {t("spaceSharing.guest.sharedFrom", { org: s.ownerOrgName })}
                      </Badge>
                      <Badge variant="outline" className={`text-xs font-medium ${LEVEL_BADGE[s.level] || LEVEL_BADGE.VIEW}`}>
                        {t(`spaceSharing.levels.${s.level}.label`)}
                      </Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CREATE SPACE DIALOG
// ============================================================================

export function CreateSpaceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("locations.createSpace")}</DialogTitle>
          <DialogDescription>
            {t("locations.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <SpaceForm
          onCreated={() => { onOpenChange(false); onSuccess() }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
