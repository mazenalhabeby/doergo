"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useTranslation } from "react-i18next"
import { usersApi } from "@/lib/api"
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

export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [newEmail, setNewEmail] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const reset = () => { setNewEmail(""); setPassword("") }

  const submit = async () => {
    if (!newEmail.trim() || !password) return
    setSaving(true)
    try {
      await usersApi.updateMyEmail({ newEmail: newEmail.trim(), currentPassword: password })
      notify.success(t("settings.changeEmail.updated"))
      onChanged()
      reset()
      onOpenChange(false)
    } catch (e) {
      notify.error(errorMessage(e, t("settings.changeEmail.failed")))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.changeEmail.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.changeEmail.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.changeEmail.currentEmail")}</Label>
            <Input value={currentEmail} disabled className="mt-1 bg-muted" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.changeEmail.newEmail")}</Label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("settings.changeEmail.newEmailPlaceholder")}
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("settings.changeEmail.currentPassword")}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1"
              onKeyDown={(e) => e.key === "Enter" && newEmail.trim() && password && submit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={!newEmail.trim() || !password || saving}>
            {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {t("settings.changeEmail.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
