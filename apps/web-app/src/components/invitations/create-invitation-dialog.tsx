"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, type CreateInvitationInput, TechnicianType, WorkMode } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

const EXPIRY_OPTIONS_KEYS = [
  { value: "24", labelKey: "invitations.createDialog.expiry.24hours" },
  { value: "48", labelKey: "invitations.createDialog.expiry.48hours" },
  { value: "72", labelKey: "invitations.createDialog.expiry.3days" },
  { value: "168", labelKey: "invitations.createDialog.expiry.7days" },
  { value: "720", labelKey: "invitations.createDialog.expiry.30days" },
] as const

const SPECIALTY_OPTIONS = [
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "mechanical", label: "Mechanical" },
  { value: "hvac", label: "HVAC" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
] as const

interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateInvitationDialog({
  open,
  onOpenChange,
}: CreateInvitationDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [targetRole, setTargetRole] = useState<"TECHNICIAN" | "DISPATCHER">("TECHNICIAN")
  const [expiresInHours, setExpiresInHours] = useState("72")
  const [technicianType, setTechnicianType] = useState<string>("")
  const [workMode, setWorkMode] = useState<string>("")
  const [specialty, setSpecialty] = useState<string>("")
  const [maxDailyJobs, setMaxDailyJobs] = useState("")

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isDispatcher = user?.role === "DISPATCHER"

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      setGeneratedCode(data?.code || null)
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      toast.success(t("invitations.createDialog.createdSuccessfully"))
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create invitation")
    },
  })

  const handleSubmit = () => {
    const input: CreateInvitationInput = {
      targetRole,
      expiresInHours: parseInt(expiresInHours),
    }

    if (targetRole === "TECHNICIAN") {
      if (technicianType) input.technicianType = technicianType
      if (workMode) input.workMode = workMode
      if (specialty) input.specialty = specialty
      if (maxDailyJobs) input.maxDailyJobs = parseInt(maxDailyJobs)
    }

    createMutation.mutate(input)
  }

  const handleCopyCode = async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    toast.success(t("common.codeCopiedToClipboard"))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset form after animation
    setTimeout(() => {
      setTargetRole("TECHNICIAN")
      setExpiresInHours("72")
      setTechnicianType("")
      setWorkMode("")
      setSpecialty("")
      setMaxDailyJobs("")
      setGeneratedCode(null)
      setCopied(false)
      createMutation.reset()
    }, 200)
  }

  // If we have a generated code, show the success view
  if (generatedCode) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("invitations.createDialog.successTitle")}</DialogTitle>
            <DialogDescription>
              {t("invitations.createDialog.successDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 space-y-4">
            <div className="flex items-center justify-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl w-full">
              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-slate-800">
                {generatedCode}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyCode}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Copy className="h-5 w-5 text-slate-400" />
                )}
              </Button>
            </div>
            <p className="text-sm text-slate-500 text-center">
              {t("invitations.createDialog.codeOnlyShownOnce")}
            </p>
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invitations.createDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("invitations.createDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target Role */}
          <div className="space-y-2">
            <Label>{t("invitations.createDialog.roleLabel")}</Label>
            {isDispatcher ? (
              <div className="flex items-center h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                {t("members.roles.technician")}
              </div>
            ) : (
              <Select
                value={targetRole}
                onValueChange={(v) => setTargetRole(v as "TECHNICIAN" | "DISPATCHER")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TECHNICIAN">{t("members.roles.technician")}</SelectItem>
                  <SelectItem value="DISPATCHER">{t("members.roles.dispatcher")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Expiry */}
          <div className="space-y-2">
            <Label>{t("invitations.createDialog.expiresInLabel")}</Label>
            <Select value={expiresInHours} onValueChange={setExpiresInHours}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS_KEYS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Technician-specific fields */}
          {targetRole === "TECHNICIAN" && (
            <>
              <div className="space-y-2">
                <Label>{t("invitations.createDialog.employmentTypeLabel")}</Label>
                <Select value={technicianType} onValueChange={setTechnicianType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("invitations.createDialog.selectTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TechnicianType.FULL_TIME}>{t("technicians.types.fullTime")}</SelectItem>
                    <SelectItem value={TechnicianType.FREELANCER}>{t("technicians.types.freelancer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("invitations.createDialog.workModeLabel")}</Label>
                <Select value={workMode} onValueChange={setWorkMode}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("invitations.createDialog.selectWorkModePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WorkMode.HYBRID}>{t("technicians.workModes.hybrid")}</SelectItem>
                    <SelectItem value={WorkMode.ON_SITE}>{t("technicians.workModes.onSite")}</SelectItem>
                    <SelectItem value={WorkMode.ON_ROAD}>{t("technicians.workModes.onRoad")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("invitations.createDialog.jobTitleLabel")}</Label>
                <Input
                  placeholder={t("invitations.createDialog.jobTitlePlaceholder")}
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  list="invitation-specialty-suggestions"
                />
                <datalist id="invitation-specialty-suggestions">
                  {SPECIALTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.label} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>{t("invitations.createDialog.maxDailyJobsLabel")}</Label>
                <Input
                  type="number"
                  placeholder={t("invitations.createDialog.maxDailyJobsPlaceholder")}
                  value={maxDailyJobs}
                  onChange={(e) => setMaxDailyJobs(e.target.value)}
                  min={1}
                  max={20}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? t("common.creating") : t("invitations.createDialog.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
