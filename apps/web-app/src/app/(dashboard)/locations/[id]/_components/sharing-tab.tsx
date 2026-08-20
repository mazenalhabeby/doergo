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
  Check,
  X,
  Users,
  Clock3,
  MapPin,
  FileText,
  Building2,
  ListChecks,
  UserPlus,
} from "lucide-react"

import { notify } from "@/lib/toast"
import {
  spaceSharingApi,
  type SpaceShare,
  type SpaceShareLevel,
  type SpaceShareStatus,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SectionHeader, EmptyState } from "./section-header"

const LEVELS: SpaceShareLevel[] = ["VIEW", "CONTRIBUTE", "CONTROL"]

const STATUS_STYLES: Record<SpaceShareStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REVOKED: "border-border bg-muted text-muted-foreground",
  DECLINED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
}

// Visibility scope flags → icon + i18n key. Kept as data so the invite form and
// the share cards render identical scope chips.
const SCOPE_FLAGS = [
  { key: "showWorkers", icon: Users, label: "workers" },
  { key: "showAttendance", icon: Clock3, label: "attendance" },
  { key: "showTracking", icon: MapPin, label: "tracking" },
  { key: "showReports", icon: FileText, label: "reports" },
] as const

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

// ── Invite form ─────────────────────────────────────────────────────────────

function InviteSection({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [code, setCode] = useState("")
  const [level, setLevel] = useState<SpaceShareLevel>("VIEW")
  const [scope, setScope] = useState({
    showWorkers: false,
    showAttendance: false,
    showTracking: false,
    showReports: false,
  })
  const [allowRequests, setAllowRequests] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      spaceSharingApi.createShare(spaceId, {
        guestOrgCode: code.trim(),
        level,
        allowRequests,
        ...scope,
      }),
    onSuccess: (share) => {
      queryClient.invalidateQueries({ queryKey: ["space-shares", spaceId] })
      notify.success(t("spaceSharing.toast.invited", { org: share.guestOrgName }))
      setCode("")
      setLevel("VIEW")
      setScope({ showWorkers: false, showAttendance: false, showTracking: false, showReports: false })
      setAllowRequests(true)
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.inviteFailed")),
  })

  const handleInvite = () => {
    if (!code.trim()) return notify.error(t("spaceSharing.codeRequired"))
    createMutation.mutate()
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Share2}
        accent="indigo"
        title={t("spaceSharing.invite.heading")}
        description={t("spaceSharing.invite.intro", { space: spaceName })}
      />

      <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="guest-code" className="text-xs">{t("spaceSharing.fields.guestCode")}</Label>
            <Input
              id="guest-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("spaceSharing.fields.guestCodePlaceholder")}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">{t("spaceSharing.fields.guestCodeHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("spaceSharing.fields.level")}</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as SpaceShareLevel)}>
              <SelectTrigger>
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
            <p className="text-[11px] text-muted-foreground">{t(`spaceSharing.levels.${level}.description`)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">{t("spaceSharing.fields.scope")}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPE_FLAGS.map(({ key, icon: Icon, label }) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {t(`spaceSharing.scope.${label}`)}
                </span>
                <Switch
                  checked={scope[key]}
                  onCheckedChange={(v) => setScope((prev) => ({ ...prev, [key]: v }))}
                />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:bg-muted/40 transition-colors">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              {t("spaceSharing.fields.allowRequests")}
            </span>
            <span className="text-[11px] text-muted-foreground">{t("spaceSharing.fields.allowRequestsHint")}</span>
          </span>
          <Switch checked={allowRequests} onCheckedChange={setAllowRequests} />
        </label>

        <div className="flex justify-end">
          <Button onClick={handleInvite} disabled={createMutation.isPending} className="gap-1.5">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("spaceSharing.invite.submit")}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Shares list ─────────────────────────────────────────────────────────────

function SharesSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [revokeTarget, setRevokeTarget] = useState<SpaceShare | null>(null)

  const { data: shares, isLoading } = useQuery({
    queryKey: ["space-shares", spaceId],
    queryFn: () => spaceSharingApi.listShares(spaceId),
  })

  const updateMutation = useMutation({
    mutationFn: ({ shareId, level }: { shareId: string; level: SpaceShareLevel }) =>
      spaceSharingApi.updateShare(spaceId, shareId, { level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-shares", spaceId] })
      notify.success(t("spaceSharing.toast.updated"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.updateFailed")),
  })

  const revokeMutation = useMutation({
    mutationFn: (shareId: string) => spaceSharingApi.revokeShare(spaceId, shareId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space-shares", spaceId] })
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
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{share.guestOrgName}</span>
                        <Badge variant="outline" className={cn("text-[11px] font-medium", STATUS_STYLES[share.status])}>
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
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
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

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("spaceSharing.shares.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("spaceSharing.shares.revokeConfirm", { org: revokeTarget?.guestOrgName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => { e.preventDefault(); if (revokeTarget) revokeMutation.mutate(revokeTarget.id) }}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("spaceSharing.shares.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Incoming requests ───────────────────────────────────────────────────────

function RequestsSection({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const { data: requests, isLoading } = useQuery({
    queryKey: ["space-share-requests", spaceId],
    queryFn: () => spaceSharingApi.listShareRequests(spaceId, "PENDING"),
  })

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, approve }: { requestId: string; approve: boolean }) =>
      spaceSharingApi.resolveRequest(requestId, approve),
    onSuccess: (_res, { approve }) => {
      queryClient.invalidateQueries({ queryKey: ["space-share-requests", spaceId] })
      notify.success(approve ? t("spaceSharing.toast.requestApproved") : t("spaceSharing.toast.requestRejected"))
    },
    onError: (err: Error) => notify.error(err.message || t("spaceSharing.toast.requestFailed")),
  })

  const count = requests?.length || 0

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Inbox}
        accent="amber"
        title={t("spaceSharing.requests.heading")}
        description={t("spaceSharing.requests.intro")}
        action={
          count > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Inbox className="h-3 w-3" />
              {count}
            </Badge>
          ) : undefined
        }
      />

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : count === 0 ? (
        <EmptyState icon={Inbox} title={t("spaceSharing.requests.empty")} />
      ) : (
        <div className="space-y-2">
          {requests!.map((req) => (
            <div key={req.id} className="rounded-xl border p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                    {req.type === "WORKER" ? <UserPlus className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{req.title}</span>
                      <Badge variant="outline" className="text-[11px]">
                        {t(`spaceSharing.requestTypes.${req.type}`)}
                      </Badge>
                    </div>
                    {req.note && <p className="mt-1 text-xs text-muted-foreground">{req.note}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {new Date(req.createdAt).toLocaleString(i18n.language, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    onClick={() => resolveMutation.mutate({ requestId: req.id, approve: true })}
                    disabled={resolveMutation.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t("spaceSharing.requests.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => resolveMutation.mutate({ requestId: req.id, approve: false })}
                    disabled={resolveMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("spaceSharing.requests.reject")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
