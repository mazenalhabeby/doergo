"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  User,
  Shield,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  Globe,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { authApi } from "@/lib/api"
import { changeLanguage, getCurrentLanguage, supportedLanguages } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getRoleLabel } from "@hbcfield/shared/types"

function getRoleColor(role: string) {
  switch (role) {
    case "ADMIN":
      return "bg-purple-100 text-purple-700"
    case "DISPATCHER":
      return "bg-blue-100 text-blue-700"
    case "TECHNICIAN":
      return "bg-green-100 text-green-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

function getPlatformLabel(platform: string, t: (key: string) => string) {
  switch (platform) {
    case "BOTH":
      return t("members.platforms.webAndMobile")
    case "WEB":
      return t("members.platforms.webOnly")
    case "MOBILE":
      return t("members.platforms.mobileOnly")
    default:
      return platform
  }
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { t } = useTranslation()

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success(t("profile.changePassword.successMessage"))
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    },
    onError: (e: Error) => {
      toast.error(e.message || t("common.error"))
    },
  })

  const passwordsMatch = newPassword === confirmPassword
  const isPasswordValid = newPassword.length >= 8
  const canSubmitPassword =
    currentPassword.length > 0 &&
    isPasswordValid &&
    passwordsMatch &&
    !changePasswordMutation.isPending

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmitPassword) return
    changePasswordMutation.mutate()
  }

  if (!user) return null

  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()

  const permissions = [
    { label: t("profile.accountInformation.createTasks"), enabled: user.canCreateTasks },
    { label: t("profile.accountInformation.viewAllTasks"), enabled: user.canViewAllTasks },
    { label: t("profile.accountInformation.assignTasks"), enabled: user.canAssignTasks },
    { label: t("profile.accountInformation.manageUsers"), enabled: user.canManageUsers },
  ]

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{t("profile.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("profile.subtitle")}
        </p>
      </div>

      {/* Account Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("profile.accountInformation.title")}</CardTitle>
              <CardDescription>{t("profile.accountInformation.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white text-2xl font-semibold">
              {initials}
            </div>

            {/* Details */}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t("profile.accountInformation.fullName")}
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {user.firstName} {user.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t("profile.accountInformation.email")}
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {user.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t("profile.accountInformation.role")}
                  </p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
                    >
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t("profile.accountInformation.platformAccess")}
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    {getPlatformLabel(user.platform, t)}
                  </p>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  {t("profile.accountInformation.permissions")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {permissions.map((perm) => (
                    <span
                      key={perm.label}
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                        perm.enabled
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-gray-50 text-gray-400 border border-gray-200"
                      }`}
                    >
                      {perm.enabled ? (
                        <Shield className="size-3 mr-1" />
                      ) : null}
                      {perm.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Lock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("profile.changePassword.title")}</CardTitle>
              <CardDescription>
                {t("profile.changePassword.description")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="current-password" className="text-sm font-medium text-slate-700">
                {t("profile.changePassword.currentPasswordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("profile.changePassword.currentPasswordPlaceholder")}
                  disabled={changePasswordMutation.isPending}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">
                {t("profile.changePassword.newPasswordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("profile.changePassword.newPasswordPlaceholder")}
                  disabled={changePasswordMutation.isPending}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {newPassword.length > 0 && !isPasswordValid && (
                <p className="text-xs text-red-500">
                  {t("profile.changePassword.minLengthError")}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                {t("profile.changePassword.confirmPasswordLabel")}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("profile.changePassword.confirmPasswordPlaceholder")}
                disabled={changePasswordMutation.isPending}
                className="h-10"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500">{t("profile.changePassword.mismatchError")}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!canSubmitPassword}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("common.changing")}
                </>
              ) : (
                t("profile.changePassword.submitButton")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Language Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <Globe className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{t("profile.language.title")}</CardTitle>
              <CardDescription>{t("profile.language.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {supportedLanguages.map((lang) => {
              const isActive = getCurrentLanguage() === lang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    changeLanguage(lang.code)
                    window.location.reload()
                  }}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    isActive
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  {lang.label}
                  {isActive && <Check className="h-4 w-4 text-blue-600" />}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
