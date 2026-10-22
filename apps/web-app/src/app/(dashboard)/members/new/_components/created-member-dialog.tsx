"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { copyText } from "@/lib/clipboard"

/** The member was created with a generated password: show it once, with a copy button. */
export function CreatedMemberDialog({
  open,
  onOpenChange,
  email,
  generatedPassword,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  generatedPassword: string | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Copy password handler
  const handleCopyPassword = async () => {
    if (generatedPassword) {
      if (!(await copyText(generatedPassword))) return
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      titleClassName="flex items-center gap-2 text-green-600"
      title={
        <>
          <Check className="h-5 w-5" />
          {t("technicians.createSuccess.title")}
        </>
      }
      descriptionClassName="space-y-4"
      description={
        <>
          <p>{t("technicians.createSuccess.description")}</p>
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("technicians.createSuccess.emailLabel")}</span>
              <span className="font-mono text-sm">{email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("technicians.createSuccess.passwordLabel")}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{generatedPassword}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyPassword}>
                  {copiedPassword ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <p className="text-amber-600 text-sm">{t("technicians.createSuccess.saveWarning")}</p>
        </>
      }
      cancelLabel={null}
      confirmLabel={t("common.done")}
      onConfirm={onDone}
    />
  )
}
