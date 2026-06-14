"use client"

import { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { useSearchParams } from "next/navigation"
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
  GitBranch,
  ListChecks,
  Repeat,
  Puzzle,
} from "lucide-react"
import NextLink from "next/link"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"

// Lazy-load sub-pages so they render inline in the settings content area
const WorkflowsPage = lazy(() => import("./workflows/page"))
const RolesPage = lazy(() => import("./roles/page"))
const CustomFieldsPage = lazy(() => import("./custom-fields/page"))
const RecurringPage = lazy(() => import("./recurring/page"))
const AuditLogPage = lazy(() => import("./audit-log/page"))

function LazyFallback() {
  return (
    <div className="space-y-4 p-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

// Strip the outer page wrapper when rendering inline — override backgrounds and padding
function EmbeddedPage({ children }: { children: React.ReactNode }) {
  return <div className="[&>div]:min-h-0 [&>div]:bg-transparent [&>div]:p-0 [&>div>div]:p-0 [&>div>div]:max-w-none">{children}</div>
}

function LazyWorkflows() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><WorkflowsPage /></EmbeddedPage></Suspense> }
function LazyRoles() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><RolesPage /></EmbeddedPage></Suspense> }
function LazyCustomFields() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><CustomFieldsPage /></EmbeddedPage></Suspense> }
function LazyRecurring() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><RecurringPage /></EmbeddedPage></Suspense> }
function LazyAuditLog() { return <Suspense fallback={<LazyFallback />}><EmbeddedPage><AuditLogPage /></EmbeddedPage></Suspense> }
import { organizationsApi, JoinPolicy } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { AVAILABLE_MODULES } from "@hbcfield/shared/client"
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

type SettingsSection =
  // Organization
  | "general" | "members" | "modules" | "workflows" | "roles" | "custom-fields" | "recurring" | "audit-log"
  // Personal
  | "profile" | "security" | "notifications"

interface NavItem {
  key: SettingsSection
  icon: typeof Building2
  label: string
}

const ORG_NAV_ITEMS: NavItem[] = [
  { key: "general", icon: Building2, label: "General" },
  { key: "members", icon: Users, label: "Members" },
  { key: "modules", icon: Puzzle, label: "Modules" },
  { key: "workflows", icon: GitBranch, label: "Workflows" },
  { key: "roles", icon: Shield, label: "Roles" },
  { key: "custom-fields", icon: ListChecks, label: "Custom Fields" },
  { key: "recurring", icon: Repeat, label: "Recurring Tasks" },
  { key: "audit-log", icon: Clock, label: "Audit Log" },
]

const PERSONAL_NAV_ITEMS: NavItem[] = [
  { key: "profile", icon: Users, label: "Profile" },
  { key: "security", icon: Key, label: "Password & Security" },
  { key: "notifications", icon: Bell, label: "Notifications" },
]

const NAV_ITEMS = [...ORG_NAV_ITEMS, ...PERSONAL_NAV_ITEMS]

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
      notify.success(t("settings.general.saved"))
    },
    onError: (error: Error) => notify.error(error.message || t("settings.general.failed")),
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
      notify.success(t("settings.joinCode.regeneratedSuccessfully"))
    },
    onError: (e: Error) => notify.error(e.message || t("common.error")),
  })

  const updatePolicyMutation = useMutation({
    mutationFn: (data: { joinPolicy: string }) => organizationsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-join-code"] })
      setSelectedPolicy(null)
      notify.success(t("settings.joinPolicy.updatedSuccessfully"))
    },
    onError: (e: Error) => notify.error(e.message || t("common.error")),
  })

  const displayCode = joinCodeData?.joinCode || newlyGeneratedCode || null

  const handleCopy = async () => {
    if (!displayCode) return
    await navigator.clipboard.writeText(displayCode)
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
      notify.success(t("settings.profileBadges.updated"))
    },
    onError: (e: Error) => notify.error(e.message || t("settings.profileBadges.failed")),
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
      notify.success(t("settings.notifications.saved"))
    },
    onError: (e: Error) => notify.error(e.message || t("settings.notifications.failed")),
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

function ModulesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()

  const [modules, setModules] = useState<string[]>([])
  const [initialized, setInitialized] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => organizationsApi.getProfile(),
  })

  useEffect(() => {
    if (profile && !initialized) {
      setModules((profile.enabledModules as string[] | null) || [])
      setInitialized(true)
    }
  }, [profile, initialized])

  const mutation = useMutation({
    mutationFn: (enabledModules: string[]) => organizationsApi.updateEnabledModules(enabledModules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-profile"] })
      refreshUser()
      notify.success("Modules updated")
    },
    onError: (e: Error) => notify.error(e.message || "Failed to update modules"),
  })

  const toggle = useCallback((key: string, enabled: boolean) => {
    const updated = enabled
      ? [...modules, key]
      : modules.filter(m => m !== key)
    setModules(updated)
    mutation.mutate(updated)
  }, [modules, mutation])

  if (isLoading) return <Skeleton className="h-[400px] w-full rounded-2xl" />

  return (
    <SettingCard
      icon={Puzzle}
      iconColor="text-orange-600"
      iconBg="bg-orange-50"
      title="Modules"
      description="Enable optional features for your organization. Disabled modules are hidden from all users."
    >
      <div className="divide-y divide-border">
        {AVAILABLE_MODULES.map(mod => (
          <ToggleRow
            key={mod.key}
            id={`module-${mod.key}`}
            label={mod.label}
            description={mod.description}
            checked={modules.includes(mod.key)}
            onChange={v => toggle(mod.key, v)}
            disabled={mutation.isPending}
          />
        ))}
      </div>
    </SettingCard>
  )
}

// ============================================================================
// ============================================================================
// PERSONAL SECTIONS
// ============================================================================

function ProfileSection() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState(user?.firstName || "")
  const [lastName, setLastName] = useState(user?.lastName || "")
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarRemoving, setAvatarRemoving] = useState(false)

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "")
      setLastName(user.lastName || "")
    }
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { organizationsApi } = await import("@/lib/api")
      await organizationsApi.updateMember(user!.id, { firstName, lastName })
      notify.success("Profile updated")
      queryClient.invalidateQueries({ queryKey: ["user"] })
      refreshUser()
    } catch (e: any) {
      notify.error(e.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      notify.error("Image must be less than 5MB")
      return
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      notify.error("Only JPEG, PNG, and WebP images are allowed")
      return
    }

    setAvatarUploading(true)
    try {
      const { usersApi } = await import("@/lib/api")
      // Upload file directly to the API gateway
      await usersApi.uploadAvatar(file)

      // Refresh user data
      await refreshUser()
      notify.success("Avatar updated")
    } catch (err: any) {
      notify.error(err.message || "Failed to upload avatar")
    } finally {
      setAvatarUploading(false)
      // Reset the input so the same file can be selected again
      e.target.value = ""
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarRemoving(true)
    try {
      const { usersApi } = await import("@/lib/api")
      await usersApi.removeAvatar()
      await refreshUser()
      notify.success("Avatar removed")
    } catch (err: any) {
      notify.error(err.message || "Failed to remove avatar")
    } finally {
      setAvatarRemoving(false)
    }
  }

  return (
    <SettingCard
      icon={Users}
      iconColor="text-foreground"
      iconBg="bg-foreground/5"
      title="Profile"
      description="Your personal information. This is visible to other members of your organization."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative group">
            <UserAvatar
              firstName={user?.firstName}
              lastName={user?.lastName}
              avatarUrl={user?.avatarUrl}
              seed={user?.id}
              size="2xl"
            />
            {/* Upload overlay */}
            <label className="absolute inset-0 rounded-full cursor-pointer bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <span className="text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarUploading ? "..." : "Edit"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
              />
            </label>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()}</p>
              {user?.avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarRemove}
                  disabled={avatarRemoving}
                  className="text-xs text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {avatarRemoving ? "Removing..." : "Remove photo"}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input value={user?.email || ""} disabled className="mt-1 bg-muted" />
          <p className="text-[11px] text-muted-foreground mt-1">Email cannot be changed. Contact support if needed.</p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>
    </SettingCard>
  )
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      notify.error("Passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      notify.error("Password must be at least 8 characters")
      return
    }
    setSaving(true)
    try {
      const { authApi } = await import("@/lib/api")
      await authApi.changePassword(currentPassword, newPassword)
      notify.success("Password changed successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (e: any) {
      notify.error(e.message || "Failed to change password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingCard
      icon={Shield}
      iconColor="text-foreground"
      iconBg="bg-foreground/5"
      title="Password & Security"
      description="Manage your password and security settings."
    >
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Current Password</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Password must be at least 8 characters with a mix of letters and numbers.</p>
        <div className="flex justify-end pt-2">
          <Button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword} size="sm">
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Key className="size-4 mr-1.5" />}
            Change Password
          </Button>
        </div>
      </div>
    </SettingCard>
  )
}

// ============================================================================
// Main Settings Page — Sidebar + Content Layout
// ============================================================================

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const searchParams = useSearchParams()

  const isAdmin = user?.role === "ADMIN"
  const canManage = user?.canManageUsers

  // Non-admins default to personal profile, admins to general
  const defaultSection: SettingsSection = canManage ? "general" : "profile"
  const initialSection = (searchParams.get("section") as SettingsSection) || defaultSection
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)

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
            <div className="sticky top-24 space-y-0.5">
              {/* Organization section — only for admins */}
              {canManage && (
                <>
                  <p className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Organization
                  </p>
                  {ORG_NAV_ITEMS.map(item => {
                    const isActive = activeSection === item.key
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveSection(item.key)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-foreground/[0.06] text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                      </button>
                    )
                  })}
                </>
              )}

              {/* Personal section */}
              <div className={canManage ? "pt-5 pb-1.5" : "pb-1.5"}>
                <p className="px-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Personal
                </p>
              </div>
              {PERSONAL_NAV_ITEMS.map(item => {
                const isActive = activeSection === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Mobile Tab Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-4 py-2 flex gap-1 overflow-x-auto">
            {NAV_ITEMS.map(item => {
              const isActive = activeSection === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex-none flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Organization sections — inline */}
            {activeSection === "general" && <GeneralSection />}
            {activeSection === "members" && <MembersSection />}
            {activeSection === "modules" && <ModulesSection />}
            {/* Organization sections — lazy loaded from sub-pages */}
            {activeSection === "workflows" && <LazyWorkflows />}
            {activeSection === "roles" && <LazyRoles />}
            {activeSection === "custom-fields" && <LazyCustomFields />}
            {activeSection === "recurring" && <LazyRecurring />}
            {activeSection === "audit-log" && <LazyAuditLog />}
            {/* Personal sections */}
            {activeSection === "profile" && <ProfileSection />}
            {activeSection === "security" && <SecuritySection />}
            {activeSection === "notifications" && <NotificationsSection />}
          </div>
        </div>
      </div>
    </div>
  )
}
