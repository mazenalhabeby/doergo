"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Copy,
  Check,
  RefreshCw,
  Shield,
  Key,
  Loader2,
  Tag,
  Building2,
  Bell,
  Paintbrush,
  Users,
  Save,
  Globe,
  Phone,
  Mail,
  Link2,
  MapPin,
  Clock,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { organizationsApi, JoinPolicy } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ============================================================================
// Constants
// ============================================================================

const INDUSTRY_OPTIONS = [
  "hvac", "plumbing", "electrical", "generalContracting",
  "cleaning", "security", "itServices", "other",
] as const

const TIMEZONE_OPTIONS = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Zurich",
  "Europe/Vienna", "Europe/Warsaw", "Europe/Stockholm", "Europe/Helsinki",
  "Europe/Istanbul", "Europe/Moscow", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney",
  "Pacific/Auckland",
] as const

type SettingsSection = "general" | "members" | "appearance" | "notifications"

const NAV_ITEMS: { key: SettingsSection; icon: typeof Building2; color: string; bgColor: string }[] = [
  { key: "general", icon: Building2, color: "text-blue-600", bgColor: "bg-blue-50" },
  { key: "members", icon: Users, color: "text-purple-600", bgColor: "bg-purple-50" },
  { key: "appearance", icon: Paintbrush, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  { key: "notifications", icon: Bell, color: "text-amber-600", bgColor: "bg-amber-50" },
]

// ============================================================================
// Reusable Components (DRY)
// ============================================================================

function SettingCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  children,
}: {
  icon: typeof Building2
  iconColor: string
  iconBg: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div className="flex-1 pr-4">
        <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}

function FormField({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof Building2
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {label}
      </Label>
      {children}
    </div>
  )
}

function SaveBar({
  onSave,
  isPending,
  t,
}: {
  onSave: () => void
  isPending: boolean
  t: (key: string) => string
}) {
  return (
    <div className="flex justify-end pt-4 border-t border-border mt-6">
      <Button
        onClick={onSave}
        disabled={isPending}
        className="gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl px-6"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isPending ? t("common.saving") : t("common.saveChanges")}
      </Button>
    </div>
  )
}

// ============================================================================
// Tab Content Components
// ============================================================================

function GeneralSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => organizationsApi.getProfile(),
  })

  const [form, setForm] = useState({
    name: "", industry: "", address: "", phone: "", email: "", website: "", timezone: "",
  })
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (profile && !initialized) {
      setForm({
        name: profile.name ?? "", industry: profile.industry ?? "",
        address: profile.address ?? "", phone: profile.phone ?? "",
        email: profile.email ?? "", website: profile.website ?? "",
        timezone: profile.timezone ?? "",
      })
      setInitialized(true)
    }
  }, [profile, initialized])

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, string>) => organizationsApi.updateProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] })
      toast.success(t("settings.general.saved"))
    },
    onError: (error: Error) => toast.error(error.message || t("settings.general.failed")),
  })

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingCard
        icon={Building2}
        iconColor="text-blue-600"
        iconBg="bg-blue-50"
        title={t("settings.general.title")}
        description={t("settings.general.description")}
      >
        <div className="space-y-5">
          <FormField icon={Building2} label={t("settings.general.orgName")}>
            <Input
              value={form.name}
              onChange={e => set("name", e.target.value)}
              className="h-11 rounded-xl"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField icon={Tag} label={t("settings.general.industry")}>
              <Select value={form.industry} onValueChange={v => set("industry", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={t("settings.general.industry")} />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(key => (
                    <SelectItem key={key} value={key}>
                      {t(`settings.general.industries.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField icon={Clock} label={t("settings.general.timezone")}>
              <Select value={form.timezone} onValueChange={v => set("timezone", v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder={t("settings.general.timezone")} />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map(tz => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField icon={MapPin} label={t("settings.general.address")}>
            <Input
              value={form.address}
              onChange={e => set("address", e.target.value)}
              className="h-11 rounded-xl"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField icon={Phone} label={t("settings.general.phone")}>
              <Input
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                className="h-11 rounded-xl"
              />
            </FormField>
            <FormField icon={Mail} label={t("settings.general.email")}>
              <Input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                className="h-11 rounded-xl"
              />
            </FormField>
          </div>

          <FormField icon={Link2} label={t("settings.general.website")}>
            <Input
              value={form.website}
              onChange={e => set("website", e.target.value)}
              placeholder="https://"
              className="h-11 rounded-xl"
            />
          </FormField>

          <SaveBar onSave={() => updateMutation.mutate(form)} isPending={updateMutation.isPending} t={t} />
        </div>
      </SettingCard>
    </div>
  )
}

function MembersSection() {
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
    queryKey: ["organization-join-code"],
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
      queryClient.invalidateQueries({ queryKey: ["organization-join-code"] })
      toast.success(t("settings.joinCode.regeneratedSuccessfully"))
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  })

  const updatePolicyMutation = useMutation({
    mutationFn: (data: { joinPolicy: string }) => organizationsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-join-code"] })
      setSelectedPolicy(null)
      toast.success(t("settings.joinPolicy.updatedSuccessfully"))
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  })

  const displayCode = joinCodeData?.joinCode || newlyGeneratedCode || null

  const handleCopy = async () => {
    if (!displayCode) return
    await navigator.clipboard.writeText(displayCode)
    setCopied(true)
    toast.success(t("common.codeCopiedToClipboard"))
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
            disabled={regenerateMutation.isPending}
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
                onClick={() => setSelectedPolicy(option.value)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
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

          {hasUnsavedChange && (
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

function AppearanceSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [badges, setBadges] = useState({ showRole: true, showType: true, showSpecialty: true })

  const { data, isLoading } = useQuery({
    queryKey: ["organization-profile-badges"],
    queryFn: () => organizationsApi.getProfileBadges(),
  })

  useEffect(() => {
    if (data?.profileBadges) setBadges(data.profileBadges)
  }, [data])

  const mutation = useMutation({
    mutationFn: (d: typeof badges) => organizationsApi.updateProfileBadges(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-profile-badges"] })
      toast.success(t("settings.profileBadges.updated"))
    },
    onError: (e: Error) => toast.error(e.message || t("settings.profileBadges.failed")),
  })

  const toggle = useCallback((field: keyof typeof badges, value: boolean) => {
    const updated = { ...badges, [field]: value }
    setBadges(updated)
    mutation.mutate(updated)
  }, [badges, mutation])

  if (isLoading) return <Skeleton className="h-[300px] w-full rounded-2xl" />

  const BADGE_TOGGLES = [
    { key: "showRole" as const, label: t("settings.profileBadges.showRole") },
    { key: "showType" as const, label: t("settings.profileBadges.showType") },
    { key: "showSpecialty" as const, label: t("settings.profileBadges.showSpecialty") },
  ]

  return (
    <SettingCard
      icon={Tag}
      iconColor="text-emerald-600"
      iconBg="bg-emerald-50"
      title={t("settings.profileBadges.title")}
      description={t("settings.profileBadges.description")}
    >
      <div className="divide-y divide-border">
        {BADGE_TOGGLES.map(item => (
          <ToggleRow
            key={item.key}
            id={`badge-${item.key}`}
            label={item.label}
            checked={badges[item.key]}
            onChange={v => toggle(item.key, v)}
            disabled={mutation.isPending}
          />
        ))}
      </div>
    </SettingCard>
  )
}

function NotificationsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [prefs, setPrefs] = useState({
    emailOnTaskCreate: false, emailOnTaskComplete: false,
    emailOnJoinRequest: true, pushEnabled: true,
  })
  const [initialized, setInitialized] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => organizationsApi.getProfile(),
  })

  useEffect(() => {
    if (profile?.notificationPrefs && !initialized) {
      setPrefs({
        emailOnTaskCreate: profile.notificationPrefs.emailOnTaskCreate ?? false,
        emailOnTaskComplete: profile.notificationPrefs.emailOnTaskComplete ?? false,
        emailOnJoinRequest: profile.notificationPrefs.emailOnJoinRequest ?? true,
        pushEnabled: profile.notificationPrefs.pushEnabled ?? true,
      })
      setInitialized(true)
    }
  }, [profile, initialized])

  const mutation = useMutation({
    mutationFn: (d: typeof prefs) => organizationsApi.updateNotificationPrefs(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] })
      toast.success(t("settings.notifications.saved"))
    },
    onError: (e: Error) => toast.error(e.message || t("settings.notifications.failed")),
  })

  if (isLoading) return <Skeleton className="h-[300px] w-full rounded-2xl" />

  const TOGGLES = [
    { key: "emailOnTaskCreate" as const, label: t("settings.notifications.emailOnTaskCreate") },
    { key: "emailOnTaskComplete" as const, label: t("settings.notifications.emailOnTaskComplete") },
    { key: "emailOnJoinRequest" as const, label: t("settings.notifications.emailOnJoinRequest") },
    { key: "pushEnabled" as const, label: t("settings.notifications.pushEnabled") },
  ]

  return (
    <SettingCard
      icon={Bell}
      iconColor="text-amber-600"
      iconBg="bg-amber-50"
      title={t("settings.notifications.title")}
      description={t("settings.notifications.description")}
    >
      <div className="divide-y divide-border">
        {TOGGLES.map(item => (
          <ToggleRow
            key={item.key}
            id={`notif-${item.key}`}
            label={item.label}
            checked={prefs[item.key]}
            onChange={v => setPrefs(prev => ({ ...prev, [item.key]: v }))}
          />
        ))}
      </div>
      <SaveBar onSave={() => mutation.mutate(prefs)} isPending={mutation.isPending} t={t} />
    </SettingCard>
  )
}

// ============================================================================
// Main Settings Page — Sidebar + Content Layout
// ============================================================================

export default function SettingsPage() {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>("general")

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.subtitle")}
          </p>
        </div>

        {/* Sidebar + Content */}
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-56 shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-1">
              {NAV_ITEMS.map(item => {
                const isActive = activeSection === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? `${item.bgColor} ${item.color} shadow-sm`
                        : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4.5 w-4.5" />
                    {t(`settings.tabs.${item.key}`)}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Mobile Tab Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-4 py-2 flex gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = activeSection === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? `${item.color}` : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{t(`settings.tabs.${item.key}`)}</span>
                </button>
              )
            })}
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {activeSection === "general" && <GeneralSection />}
            {activeSection === "members" && <MembersSection />}
            {activeSection === "appearance" && <AppearanceSection />}
            {activeSection === "notifications" && <NotificationsSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
