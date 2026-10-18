"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Share2,
  Send,
  Trash2,
  Loader2,
  Inbox,
  Users,
  Clock3,
  MapPin,
  FileText,
  Building2,
  ListChecks,
  UserPlus,
} from "lucide-react"

import { notify } from "@/lib/toast"
import { spaceSharingApi, type SpaceShare, type SpaceShareLevel, type SpaceShareStatus } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmTargetDialog } from "@/components/confirm-dialog"
import { SectionHeader, EmptyState } from "./section-header"
import { keys } from "@/lib/query-keys"
import Link from "next/link"
import { LEVELS, STATUS_TONE, SCOPE_FLAGS, InviteSection, RequestsSection } from "./invite-section"
import { toneChip } from "@/lib/status-tones"

export function SharingTab({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  return (
    <div className="space-y-8">
      <InviteSection spaceId={spaceId} spaceName={spaceName} />
      <Separator />
      <SharesSection spaceId={spaceId} />
      <Separator />
      <RequestsSection spaceId={spaceId} />
    </div>
  )
}

// ── Shares list ─────────────────────────────────────────────────────────────

function SharesSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [revokeTarget, setRevokeTarget] = useState<SpaceShare | null>(null)

  const { data: shares, isLoading } = useQuery({
    queryKey: keys.spaces.shares(spaceId),
    queryFn: () => spaceSharingApi.listShares(spaceId),
  })

  const updateMutation = useMutation({
    mutationFn: ({ shareId, level }: { shareId: string; level: SpaceShareLevel }) =>
      spaceSharingApi.updateShare(spaceId, shareId, { level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.spaces.shares(spaceId) })
      notify.success(t("spaceSharing.toast.updated"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.updateFailed")),
  })

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) => spaceSharingApi.revokeShare(spaceId, shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.spaces.shares(spaceId) })
      setRevokeTarget(null)
      notify.success(t("spaceSharing.toast.revoked"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.revokeFailed")),
  })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Building2}
        accent="blue"
        title={t("spaceSharing.shares.heading")}
        description={t("spaceSharing.shares.intro")}
        action={
          shares && shares.length > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {shares.length}
            </Badge>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !shares || shares.length === 0 ? (
        <EmptyState
          icon={Share2}
          title={t("spaceSharing.shares.empty.title")}
          description={t("spaceSharing.shares.empty.description")}
        />
      ) : (
        <div className="space-y-2">
          {shares.map((share) => {
            const activeScopes = SCOPE_FLAGS.filter((f) => share[f.key])
            const editable = share.status === "PENDING" || share.status === "ACTIVE"
            return (
              <div key={share.id} className="rounded-xl border p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={
                        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 " +
                        "text-blue-600 dark:bg-blue-950 dark:text-blue-300"
                      }
                    >
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{share.guestOrgName}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-transparent text-[11px] font-medium",
                            toneChip(STATUS_TONE[share.status]),
                          )}
                        >
                          {t(`spaceSharing.statuses.${share.status}`)}
                        </Badge>
                      </div>
                      {activeScopes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {activeScopes.map(({ key, icon: Icon, label }) => (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <Icon className="h-3 w-3" />
                              {t(`spaceSharing.scope.${label}`)}
                            </span>
                          ))}
                          {share.allowRequests && (
                            <span
                              className={
                                "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 " +
                                "text-[11px] text-muted-foreground"
                              }
                            >
                              <ListChecks className="h-3 w-3" />
                              {t("spaceSharing.scope.requestsAllowed")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{t("spaceSharing.scope.boardOnly")}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={share.level}
                      onValueChange={(v) => updateMutation.mutate({ shareId: share.id, level: v as SpaceShareLevel })}
                      disabled={!editable || updateMutation.isPending}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((lv) => (
                          <SelectItem key={lv} value={lv}>
                            {t(`spaceSharing.levels.${lv}.label`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                        onClick={() => setRevokeTarget(share)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only">{t("spaceSharing.shares.revoke")}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmTargetDialog
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t("spaceSharing.shares.revokeTitle")}
        description={t("spaceSharing.shares.revokeConfirm", { org: revokeTarget?.guestOrgName })}
        confirmLabel={t("spaceSharing.shares.revoke")}
        mutation={revokeMutation}
      />
    </div>
  )
}
