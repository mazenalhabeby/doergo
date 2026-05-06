"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, UserPlus, Copy, Check, Mail, Send } from "lucide-react"
import { toast } from "sonner"

import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import {
  invitationsApi,
  type CreateInvitationInput,

  WorkMode,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const SPECIALTY_OPTIONS = [
  "Electrical", "Plumbing", "Mechanical", "HVAC", "General", "Other",
] as const

const EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
] as const

export default function InviteMemberPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [role, setRole] = useState<string>("TECHNICIAN")
  const [email, setEmail] = useState("")
  const [expiresInHours, setExpiresInHours] = useState("168")
  const [workMode, setWorkMode] = useState<string>("")
  const [specialty, setSpecialty] = useState("")
  const [maxDailyJobs, setMaxDailyJobs] = useState("")

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isDispatcher = user?.role === "DISPATCHER"
  const isTechnician = role === "TECHNICIAN"

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      const code = data?.code
      setGeneratedCode(code || null)
      queryClient.invalidateQueries({ queryKey: ["invitations"] })
      queryClient.invalidateQueries({ queryKey: ["members"] })

      // If email provided, the backend will send invitation email
      if (email.trim()) {
        toast.success(t("members.invite.emailSent"), { description: email })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t("members.invite.failedToCreate"))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const input: CreateInvitationInput = {
      targetRole: role,
      expiresInHours: parseInt(expiresInHours),
      email: email.trim() || undefined,
    }

    if (isTechnician) {
      if (workMode) input.workMode = workMode
      if (specialty) input.specialty = specialty
      if (maxDailyJobs) input.maxDailyJobs = parseInt(maxDailyJobs)
    }

    createMutation.mutate(input)
  }

  const handleCopy = async () => {
    if (!generatedCode) return
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    toast.success(t("common.codeCopiedToClipboard"))
    setTimeout(() => setCopied(false), 2000)
  }

  const canInvite = user?.role === "ADMIN" || user?.role === "DISPATCHER"
  if (!canInvite) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/members">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("members.invite.backToMembers")}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-slate-800 mb-2">{t("members.invite.accessDenied")}</h3>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success view — show generated code
  if (generatedCode) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        <Link href="/members">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("members.invite.backToMembers")}
          </Button>
        </Link>

        <Card className="max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>{t("members.invite.successTitle")}</CardTitle>
            <CardDescription>{t("members.invite.successDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code Display */}
            <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-blue-800 flex-1 text-center">
                {generatedCode}
              </span>
              <Button variant="ghost" size="icon" onClick={handleCopy} className="shrink-0 rounded-lg">
                {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-blue-400" />}
              </Button>
            </div>

            {email.trim() && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
                <Mail className="h-4 w-4 shrink-0" />
                {t("members.invite.emailSentTo", { email })}
              </div>
            )}

            <p className="text-sm text-slate-500 text-center">
              {t("members.invite.shareCodeHint")}
            </p>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => {
                setGeneratedCode(null)
                setEmail("")
                setCopied(false)
              }}>
                {t("members.invite.inviteAnother")}
              </Button>
              <Link href="/members" className="flex-1">
                <Button className="w-full">{t("common.done")}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Back button */}
      <Link href="/members">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("members.invite.backToMembers")}
        </Button>
      </Link>

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("members.invite.title")}
          </CardTitle>
          <CardDescription>{t("members.invite.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Role */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700">{t("members.invite.roleSection")}</h3>
              <div className="space-y-2">
                <Label>{t("members.invite.roleLabel")}</Label>
                {isDispatcher ? (
                  <div className="flex items-center h-10 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
                    {t("members.roles.technician")}
                  </div>
                ) : (
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TECHNICIAN">{t("members.roles.technician")}</SelectItem>
                      <SelectItem value="DISPATCHER">{t("members.roles.dispatcher")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Email (optional) */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700">{t("members.invite.contactSection")}</h3>
              <div className="space-y-2">
                <Label htmlFor="email">{t("members.invite.emailLabel")} <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                />
                <p className="text-xs text-slate-500">{t("members.invite.emailHint")}</p>
              </div>
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <Label>{t("members.invite.expiresLabel")}</Label>
              <Select value={expiresInHours} onValueChange={setExpiresInHours}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Technician details */}
            {isTechnician && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700">{t("members.invite.workDetails")}</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("members.invite.employmentTypeLabel")}</Label>
                      <SelectTrigger><SelectValue placeholder={t("common.optional")} /></SelectTrigger>
                      <SelectContent>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("members.invite.workModeLabel")}</Label>
                    <Select
                      onValueChange={setWorkMode}
                    >
                      <SelectTrigger><SelectValue placeholder={t("common.optional")} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value={WorkMode.HYBRID}>{t("technicians.workModes.hybrid")}</SelectItem>
                        )}
                        <SelectItem value={WorkMode.ON_SITE}>{t("technicians.workModes.onSite")}</SelectItem>
                        <SelectItem value={WorkMode.ON_ROAD}>{t("technicians.workModes.onRoad")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("members.invite.specialtyLabel")}</Label>
                    <Input
                      placeholder={t("members.invite.specialtyPlaceholder")}
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      list="specialty-list"
                    />
                    <datalist id="specialty-list">
                      {SPECIALTY_OPTIONS.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("members.invite.maxDailyJobsLabel")}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      placeholder="5"
                      value={maxDailyJobs}
                      onChange={(e) => setMaxDailyJobs(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Link href="/members">
                <Button type="button" variant="outline">{t("common.cancel")}</Button>
              </Link>
              <Button
                type="submit"
                disabled={!email.trim() || createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? (
                  t("common.creating")
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t("members.invite.createButton")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
