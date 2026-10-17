"use client"

import { useTranslation } from "react-i18next"
import { Check, Copy, KeyRound, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Password reset: the button, then the temporary password shown once for copying. */
export function MemberSecuritySection({
  tempPassword,
  copied,
  isResetting,
  onReset,
  onCopy,
}: {
  tempPassword: string | null
  copied: boolean
  isResetting: boolean
  onReset: () => void
  onCopy: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.password")}</Label>
        {!tempPassword && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isResetting}
            className="h-7 text-xs"
          >
            <KeyRound className="h-3 w-3 mr-1.5" />
            {isResetting ? t("common.generating") : t("members.memberEditor.resetPassword")}
          </Button>
        )}
      </div>
      {tempPassword ? (
        <div className="space-y-2">
          <div
            className={"flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border " +
              "border-amber-200 dark:border-amber-800/50 rounded-lg"}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">{t("members.memberEditor.copyPasswordWarning")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={tempPassword} className="font-mono text-sm h-9" />
            <Button variant="outline" size="icon" onClick={onCopy} className="h-9 w-9 flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
