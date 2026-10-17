"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Share2,
  Send,
  Loader2,
  Inbox,
  Users,
  Clock3,
  MapPin,
  FileText,
  ListChecks,
  UserPlus,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { spaceSharingApi, type SpaceShareLevel, type SpaceShareStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SectionHeader, EmptyState } from "./section-header"
import { keys } from "@/lib/query-keys"
import Link from "next/link"

export const LEVELS: SpaceShareLevel[] = ["VIEW", "CONTRIBUTE", "CONTROL"]

export const STATUS_STYLES: Record<SpaceShareStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REVOKED: "border-border bg-muted text-muted-foreground",
  DECLINED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
}

// Visibility scope flags → icon + i18n key. Kept as data so the invite form and
// the share cards render identical scope chips.
export const SCOPE_FLAGS = [
  { key: "showWorkers", icon: Users, label: "workers" },
  { key: "showAttendance", icon: Clock3, label: "attendance" },
  { key: "showTracking", icon: MapPin, label: "tracking" },
  { key: "showReports", icon: FileText, label: "reports" },
] as const

// ── Invite form ─────────────────────────────────────────────────────────────

export function InviteSection({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
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
      queryClient.invalidateQueries({ queryKey: keys.spaces.shares(spaceId) })
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
                className={"flex items-center justify-between gap-3 rounded-lg border bg-card p-3 " +
                  "cursor-pointer hover:bg-muted/40 transition-colors"}
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

        <label
          className={"flex items-center justify-between gap-3 rounded-lg border bg-card p-3 " +
            "cursor-pointer hover:bg-muted/40 transition-colors"}>
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

// ── Incoming requests ───────────────────────────────────────────────────────

export function RequestsSection({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation()

  const { data: requests, isLoading } = useQuery({
    queryKey: keys.spaces.shareRequests(spaceId),
    queryFn: () => spaceSharingApi.listShareRequests(spaceId, "PENDING"),
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
                  <span
                    className={"flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 " +
                      "text-amber-600 dark:bg-amber-950 dark:text-amber-300"}>
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
                      {new Date(req.createdAt).toLocaleString(
                        i18n.language,
                        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                {/* Decided in Approvals — the one place. */}
                <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs">
                  <Link href={`/approvals?kind=guestRequest&id=${encodeURIComponent(req.id)}`}>
                    <Inbox className="h-3.5 w-3.5" />
                    {t("approvals.decideInApprovals")}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
