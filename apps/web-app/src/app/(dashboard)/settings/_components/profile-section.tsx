"use client"

import { useState, useEffect } from "react"
import { personName } from "@hbcfield/shared/client"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Users, Save } from "lucide-react"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { SettingCard } from "./setting-card"
import { usersApi } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { ChangeEmailDialog } from "./change-email-dialog"

export function ProfileSection() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState(user?.firstName || "")
  const [lastName, setLastName] = useState(user?.lastName || "")
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarRemoving, setAvatarRemoving] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)

  const userTimeFormat: "12h" | "24h" = user?.timeFormat === "12h" ? "12h" : "24h"
  // Local, unsaved preference — only persisted when "Save Changes" is clicked.
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(userTimeFormat)

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "")
      setLastName(user.lastName || "")
      setTimeFormat(user.timeFormat === "12h" ? "12h" : "24h")
    }
  }, [user])

  const dirty =
    firstName.trim() !== (user?.firstName || "") ||
    lastName.trim() !== (user?.lastName || "") ||
    timeFormat !== userTimeFormat
  const canSave = dirty && firstName.trim() !== "" && lastName.trim() !== "" && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      // Self-service — works for any user (not the admin member endpoint).
      await usersApi.updateMe({ firstName: firstName.trim(), lastName: lastName.trim(), timeFormat })
      notify.success(t("settings.profile.updated"))
      refreshUser()
    } catch (e) {
      notify.error(errorMessage(e, t("settings.profile.failed")))
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
      notify.error(t("settings.profile.imageTooLarge"))
      return
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      notify.error(t("settings.profile.invalidImageType"))
      return
    }

    setAvatarUploading(true)
    try {
      // Upload file directly to the API gateway
      await usersApi.uploadAvatar(file)

      // Refresh user data
      await refreshUser()
      notify.success(t("settings.profile.avatarUpdated"))
    } catch (err) {
      notify.error(errorMessage(err, t("settings.profile.avatarUploadFailed")))
    } finally {
      setAvatarUploading(false)
      // Reset the input so the same file can be selected again
      e.target.value = ""
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarRemoving(true)
    try {
      await usersApi.removeAvatar()
      await refreshUser()
      notify.success(t("settings.profile.avatarRemoved"))
    } catch (err) {
      notify.error(errorMessage(err, t("settings.profile.avatarRemoveFailed")))
    } finally {
      setAvatarRemoving(false)
    }
  }

  return (
    <SettingCard
      icon={Users}
      iconColor="text-foreground"
      iconBg="bg-foreground/5"
      title={t("settings.profile.title")}
      description={t("settings.profile.description")}
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
                {avatarUploading ? "..." : t("settings.profile.editAvatar")}
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
            <p className="text-sm font-medium text-foreground">{personName(user)}</p>
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
                  {avatarRemoving ? t("common.removing") : t("settings.profile.removePhoto")}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.profile.firstName")}</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.profile.lastName")}</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("settings.profile.email")}</Label>
          <div className="flex gap-2 mt-1">
            <Input value={user?.email || ""} disabled className="bg-muted flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)}>
              {t("settings.profile.changeEmailButton")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t("settings.profile.emailLoginNote")}
          </p>
        </div>

        {/* Clock format — per-user 12h / 24h display preference (saved with the form) */}
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Label className="text-xs text-muted-foreground">{t("settings.profile.timeFormat")}</Label>
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              {([
                { value: "24h" as const, label: t("settings.profile.timeFormat24"), sample: "14:30" },
                { value: "12h" as const, label: t("settings.profile.timeFormat12"), sample: "2:30 PM" },
              ]).map((opt) => {
                const active = timeFormat === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimeFormat(opt.value)}
                    className={cn(
                      "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{opt.sample}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {t("settings.profile.timeFormatNote")}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!canSave} size="sm">
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Save className="size-4 mr-1.5" />}
            {t("common.saveChanges")}
          </Button>
        </div>
      </div>

      <ChangeEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        currentEmail={user?.email || ""}
        onChanged={() => {
          refreshUser()
        }}
      />
    </SettingCard>
  )
}
