"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Copy,
  Check,
  RefreshCw,
  Shield,
  Key,
  Loader2,
  CalendarDays,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { SettingCard } from "./setting-card"
import { useRouteAccess } from "@/hooks/use-route-access"
import { organizationsApi, JoinPolicy } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { copyText } from "@/lib/clipboard"

export function MembersSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const JOIN_POLICY_OPTIONS = [
    { value: JoinPolicy.OPEN, label: t("settings.joinPolicy.open"), description: t("settings.joinPolicy.openDescription"), color: "emerald" },
    { value: JoinPolicy.INVITE_ONLY, label: t("settings.joinPolicy.inviteOnly"), description: t("settings.joinPolicy.inviteOnlyDescription"), color: "blue" },
    { value: JoinPolicy.CLOSED, label: t("settings.joinPolicy.closed"), description: t("settings.joinPolicy.closedDescription"), color: "slate" },
  ] as const

  const [copied, setCopied] = useState(false)
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null)
  const [newlyGeneratedCode, setNewlyGeneratedCode] = useState<string | null>(null)

  const { data: joinCodeData, isLoading } = useQuery({
    queryKey: keys.people.joinCode(),
    queryFn: () => organizationsApi.getJoinCode(),
  })

  const currentPolicy = selectedPolicy ?? joinCodeData?.joinPolicy ?? JoinPolicy.INVITE_ONLY
  const hasUnsavedChange = selectedPolicy !== null && selectedPolicy !== joinCodeData?.joinPolicy

  const regenerateMutation = useMutation({
    mutationFn: () => organizationsApi.regenerateJoinCode(),
    onSuccess: (data) => {
      // Use the code from the response directly (in case refetch is slow)
      const code = data?.joinCode
      if (code) setNewlyGeneratedCode(code)
      queryClient.invalidateQueries({ queryKey: keys.people.joinCode() })
      notify.success(t("settings.joinCode.regeneratedSuccessfully"))
    },
    onError: (e: Error) => notify.error(e.message || t("common.error")),
  })

  /*
    The number every member's vacation balance is measured against. It had a
    schema default of 25 and no way to change it, so the balance was an
    accurate calculation over a figure nobody had chosen.
  */
  // GET /organizations/profile is @Roles(ADMIN): a member manager with canManageUsers
  // reads the join code here but not the profile, so the leave allowance is ADMIN's.
  const isOrgAdmin = useRouteAccess().holds("admin")
  const { data: orgProfile } = useQuery({
    queryKey: keys.organization.profile(),
    queryFn: () => organizationsApi.getProfile(),
    enabled: isOrgAdmin,
  })
  const [leaveDays, setLeaveDays] = useState<string | null>(null)
  const storedLeave = (orgProfile as { defaultLeaveAllowance?: number } | undefined)?.defaultLeaveAllowance
  const leaveValue = leaveDays ?? (storedLeave !== undefined ? String(storedLeave) : "")
  const leaveDirty = leaveDays !== null && leaveDays !== String(storedLeave ?? "")

  const updateLeaveMutation = useMutation({
    mutationFn: (days: number) => organizationsApi.updateLeavePolicy(days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
      // The balance is measured against this number and is cached separately,
      // so without this the vacation ring keeps showing the old allowance
      // until something else happens to refetch it.
      queryClient.invalidateQueries({ queryKey: keys.timeOff.myBalance() })
      setLeaveDays(null)
      notify.success(t("settings.leave.saved"))
    },
    onError: (e: Error) => notify.error(e.message || t("common.error")),
  })

  const updatePolicyMutation = useMutation({
    mutationFn: (data: { joinPolicy: string }) => organizationsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.people.joinCode() })
      setSelectedPolicy(null)
      notify.success(t("settings.joinPolicy.updatedSuccessfully"))
    },
    onError: (e: Error) => notify.error(e.message || t("common.error")),
  })

  const displayCode = joinCodeData?.joinCode || newlyGeneratedCode || null

  const handleCopy = async () => {
    if (!displayCode) return
    if (!(await copyText(displayCode))) return
    setCopied(true)
    notify.copied()
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full rounded-2xl" />
  }

  return (
    <div className="space-y-6">
      {/* Join Code */}
      <SettingCard
        icon={Key}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        title={t("settings.joinCode.title")}
        description={t("settings.joinCode.description")}
      >
        <div className="space-y-4">
          {/* Join Code Display */}
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
            {displayCode ? (
              <>
                <span className="text-2xl font-mono font-bold tracking-[0.3em] text-blue-800 flex-1">
                  {displayCode}
                </span>
                <Button variant="ghost" size="icon" onClick={handleCopy} className="shrink-0 rounded-lg">
                  {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-blue-400" />}
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground flex-1">
                {t("settings.joinCode.noCode")}
              </span>
            )}
          </div>

          {/* Generate / Regenerate Button */}
          <Button
            variant="outline"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || !isOrgAdmin}
            className="gap-2 rounded-xl"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {displayCode ? t("settings.joinCode.regenerateCode") : t("settings.joinCode.generateCode")}
          </Button>
        </div>
      </SettingCard>

      {/* Annual vacation days — PATCH /organizations/leave-policy is @Roles(ADMIN). */}
      {isOrgAdmin && (<>
      <SettingCard
        icon={CalendarDays}
        iconColor="text-emerald-600"
        iconBg="bg-emerald-50"
        title={t("settings.leave.title")}
        description={t("settings.leave.description")}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="leave-days" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("settings.leave.label")}
            </label>
            <input
              id="leave-days"
              type="number"
              min={0}
              max={100}
              value={leaveValue}
              onChange={(e) => setLeaveDays(e.target.value)}
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none transition-colors focus:border-primary"
            />
          </div>
          <Button
            size="sm"
            disabled={!leaveDirty || updateLeaveMutation.isPending}
            onClick={() => updateLeaveMutation.mutate(Number(leaveValue))}
          >
            {t("common.save")}
          </Button>
        </div>
        {/* Says what the number does NOT override, because the per-member field
            is on a different screen and an admin changing this one would
            otherwise expect it to apply to everybody. */}
        <p className="mt-3 text-xs text-muted-foreground">{t("settings.leave.hint")}</p>
      </SettingCard>
      </>)}

      {/* Join Policy */}
      <SettingCard
        icon={Shield}
        iconColor="text-purple-600"
        iconBg="bg-purple-50"
        title={t("settings.joinPolicy.title")}
        description={t("settings.joinPolicy.description")}
      >
        <div className="space-y-3">
          {JOIN_POLICY_OPTIONS.map(option => {
            const isActive = currentPolicy === option.value
            return (
              <button
                key={option.value}
                // Changing who may join is ADMIN-only on the server; a member who manages
                // users sees the policy but cannot pick another.
                onClick={() => isOrgAdmin && setSelectedPolicy(option.value)}
                disabled={!isOrgAdmin}
                aria-disabled={!isOrgAdmin}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive
                    ? "border-blue-400 bg-blue-50/60 shadow-sm"
                    : "border-border bg-card hover:border-border hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isActive ? "border-blue-500 bg-blue-500" : "border-border"
                  }`}>
                    {isActive && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isActive ? "text-blue-700" : "text-foreground"}`}>
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                </div>
              </button>
            )
          })}

          {hasUnsavedChange && isOrgAdmin && (
            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <Button
                onClick={() => updatePolicyMutation.mutate({ joinPolicy: selectedPolicy! })}
                disabled={updatePolicyMutation.isPending}
                className="rounded-xl bg-blue-600 hover:bg-blue-700"
              >
                {updatePolicyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("common.saveChanges")}
              </Button>
              <Button variant="ghost" onClick={() => setSelectedPolicy(null)} className="rounded-xl">
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
      </SettingCard>
    </div>
  )
}
