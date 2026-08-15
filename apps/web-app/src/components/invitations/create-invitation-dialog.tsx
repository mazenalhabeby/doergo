"use client"

import { useState, useCallback, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Copy, Check, CheckCircle2, Mail, Link2, ChevronDown, ShieldCheck } from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, locationsApi, type CreateInvitationInput, type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScheduleFields, createDefaultSchedule, type EditableScheduleRow } from "@/components/schedule-fields"
import { AccessFields } from "@/components/access-fields"
import { defaultAccessDraft, serializeAccessDraft, getDefaultModules } from "@hbcfield/shared/client"
import type { AccessDraft } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInvitationDialog({ open, onOpenChange }: CreateInvitationDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [mode, setMode] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [position, setPosition] = useState("")
  const [scheduleType, setScheduleType] = useState("NONE")
  const [scheduleRows, setScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
  const [monthlyHourBudget, setMonthlyHourBudget] = useState<number | "">("")
  const [spaceId, setSpaceId] = useState("none")

  // Access Profile pre-config — applied to the member on accept, so their first
  // screen already matches their final access (no post-registration change).
  const [access, setAccess] = useState<AccessDraft>(() => defaultAccessDraft())
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessTouched, setAccessTouched] = useState(false)
  const patchAccess = useCallback((p: Partial<AccessDraft>) => {
    setAccessTouched(true)
    setAccess((cur) => ({ ...cur, ...p }))
  }, [])

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // Fetch spaces
  const { data: spacesData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
    enabled: open,
  })
  const locations = spacesData?.data || []

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      const code = data?.code
      if (code) {
        setGeneratedCode(code)
        setSuccess(true)
        navigator.clipboard.writeText(code).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || t("invitations.inviteDialog.failedToCreate"))
    },
  })

  const handleSubmit = useCallback(() => {
    // Invitations are always for Employees; management is granted via permissions.
    const input: CreateInvitationInput = { targetRole: "EMPLOYEE" }
    if (mode === "email" && email.trim()) input.email = email.trim()
    if (position.trim()) input.position = position.trim()
    if (scheduleType !== "NONE") input.scheduleType = scheduleType
    if (scheduleType === "FIXED") {
      input.schedule = scheduleRows.map((r) => ({
        dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, isActive: r.isActive,
      }))
    }
    if (scheduleType === "FLEXIBLE" && monthlyHourBudget !== "") {
      input.monthlyHourBudget = Number(monthlyHourBudget)
    }
    if (spaceId && spaceId !== "none") input.spaceId = spaceId
    // Pre-assigned role (validated server-side) + pre-configured access → both
    // applied to the new member on accept, so their first screen already matches.
    if (access.memberRoleId) input.memberRoleId = access.memberRoleId
    input.accessProfile = serializeAccessDraft(access)
    createMutation.mutate(input)
  }, [mode, email, position, scheduleType, scheduleRows, monthlyHourBudget, spaceId, access, createMutation])

  // Keep the feature tabs in sync with the position until the admin edits access
  // themselves (then their choices win).
  const handlePositionChange = useCallback((next: string) => {
    setPosition(next)
    if (!accessTouched) setAccess((cur) => ({ ...cur, modules: getDefaultModules(next.trim() || null) }))
  }, [accessTouched])

  const platformSummary = useMemo(() => {
    const key = access.platforms === "web"
      ? "accessBuilder.platforms.webOnly"
      : access.platforms === "mobile"
      ? "accessBuilder.platforms.mobileOnly"
      : "accessBuilder.platforms.both"
    return t(key)
  }, [access.platforms, t])

  const handleCopyCode = useCallback(async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCodeCopied(true)
    notify.success(t("invitations.inviteDialog.codeCopied"))
    setTimeout(() => setCodeCopied(false), 3000)
  }, [generatedCode])

  const handleSendAnother = useCallback(() => {
    setGeneratedCode(null)
    setSuccess(false)
    setEmail("")
    setPosition("")
    setScheduleType("NONE")
    setScheduleRows(createDefaultSchedule())
    setMonthlyHourBudget("")
    setAccess(defaultAccessDraft())
    setAccessOpen(false)
    setAccessTouched(false)
    setCodeCopied(false)
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(() => {
      setMode("email")
      setEmail("")
      setPosition("")
      setScheduleType("NONE")
    setScheduleRows(createDefaultSchedule())
    setMonthlyHourBudget("")
      setSpaceId("none")
      setAccess(defaultAccessDraft())
      setAccessOpen(false)
      setAccessTouched(false)
      setGeneratedCode(null)
      setSuccess(false)
      setCodeCopied(false)
      createMutation.reset()
    }, 200)
  }, [onOpenChange, createMutation])

  // ─── Success view ──────────────────────────────────────────────────────

  if (success && generatedCode) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invitations.inviteDialog.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {mode === "email" && email ? (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("invitations.inviteDialog.invitationSent")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("invitations.inviteDialog.emailSentToPrefix")} <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>
                <div className="bg-muted/60 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">{t("invitations.inviteDialog.codeAlsoInEmail")}</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-xl font-mono font-bold tracking-[0.15em] text-foreground">{generatedCode}</p>
                    <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-7 w-7">
                      {codeCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("invitations.inviteDialog.codeCreated")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("invitations.inviteDialog.shareCode")}</p>
                </div>
                <div className="bg-muted/60 rounded-xl p-5">
                  <p className="text-3xl font-mono font-bold tracking-[0.2em] text-foreground">{generatedCode}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleSendAnother} className="flex-1 rounded-lg">
                {mode === "email" ? t("invitations.inviteDialog.sendAnother") : t("invitations.inviteDialog.createAnother")}
              </Button>
              {mode === "code" && (
                <Button variant="outline" onClick={handleCopyCode} className="rounded-lg">
                  {codeCopied ? <><Check className="h-4 w-4 mr-1.5 text-green-600" />{t("common.copied")}</> : <><Copy className="h-4 w-4 mr-1.5" />{t("common.copy")}</>}
                </Button>
              )}
              <Button onClick={handleClose} className="flex-1 rounded-lg">{t("common.done")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ─── Form view ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitations.inviteDialog.title")}</DialogTitle>
          <DialogDescription>{t("invitations.inviteDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Method toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("invitations.inviteDialog.methodLabel")}</Label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-lg">
              <button
                type="button"
                onClick={() => setMode("email")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
                  mode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mail className="h-4 w-4" />{t("invitations.inviteDialog.emailLabel")}
              </button>
              <button
                type="button"
                onClick={() => setMode("code")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
                  mode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Link2 className="h-4 w-4" />{t("invitations.inviteDialog.codeLabel")}
              </button>
            </div>
          </div>

          {/* Email (email mode only) */}
          {mode === "email" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t("invitations.inviteDialog.emailLabel")}</Label>
              <Input type="email" placeholder={t("invitations.inviteDialog.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
            </div>
          )}

          {/* Position / title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t("invitations.inviteDialog.positionLabel")} <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
            </Label>
            <Input
              placeholder={t("invitations.inviteDialog.positionPlaceholder")}
              value={position}
              onChange={(e) => handlePositionChange(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Schedule — same control as the Edit dialog (type + weekly hours / budget) */}
          <ScheduleFields
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            scheduleRows={scheduleRows}
            onScheduleRowsChange={setScheduleRows}
            monthlyHourBudget={monthlyHourBudget}
            onMonthlyHourBudgetChange={setMonthlyHourBudget}
          />

          {/* Space (optional) */}
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("invitations.inviteDialog.spaceLabel")} <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
              </Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t("invitations.inviteDialog.spacePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("invitations.inviteDialog.noSpace")}</SelectItem>
                  {locations.map((loc: CompanyLocation) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Access & permissions — pre-configured so the member's first screen
              already matches their final access. Collapsed by default with a
              sensible default; expand to fine-tune. */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setAccessOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("invitations.inviteDialog.accessTitle", "Access & permissions")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {platformSummary} · {t("invitations.inviteDialog.accessFeatureCount", "{{count}} features", { count: access.modules.length })}
                    {access.canManageUsers ? ` · ${t("accessBuilder.perms.manage.title")}` : ""}
                  </p>
                </div>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", accessOpen && "rotate-180")} />
            </button>
            {accessOpen && (
              <div className="border-t border-border px-3 py-4">
                <AccessFields value={access} onChange={patchAccess} allowAdmin={false} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-lg">{t("common.cancel")}</Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || (mode === "email" && !email.trim())}
            data-tour="members-invite-send"
            className="rounded-lg"
          >
            {createMutation.isPending
              ? mode === "email" ? t("invitations.inviteDialog.sending") : t("common.generating")
              : mode === "email" ? t("invitations.inviteDialog.sendInvitation") : t("invitations.inviteDialog.generateCode")
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
