"use client"

import { useState } from "react"
import { Shield, Key, Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useTranslation } from "react-i18next"
import { SettingCard } from "./setting-card"
import { authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SecuritySection() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  // Must match the backend StrongPasswordField policy (lower + upper + number, 8+).
  const STRONG_PW = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      notify.error(t("validation.passwordsDoNotMatch"))
      return
    }
    if (!STRONG_PW.test(newPassword)) {
      notify.error(t("settings.security.passwordPolicyError"))
      return
    }
    if (newPassword === currentPassword) {
      notify.error(t("settings.security.passwordSameError"))
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      notify.success(t("settings.security.passwordChanged"), t("settings.security.passwordChangedDetail"))
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (e) {
      notify.error(errorMessage(e, t("settings.security.changeFailed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingCard
      icon={Shield}
      iconColor="text-foreground"
      iconBg="bg-foreground/5"
      title={t("settings.security.title")}
      description={t("settings.security.description")}
    >
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">{t("settings.security.currentPassword")}</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.security.newPassword")}</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.security.confirmPassword")}</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("settings.security.passwordHint")}</p>
        <div className="flex justify-end pt-2">
          <Button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword || !confirmPassword} size="sm">
            {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Key className="size-4 mr-1.5" />}
            {t("settings.security.changeButton")}
          </Button>
        </div>
      </div>
    </SettingCard>
  )
}
