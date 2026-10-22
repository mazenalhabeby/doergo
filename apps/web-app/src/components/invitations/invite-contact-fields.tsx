"use client"

import { useTranslation } from "react-i18next"
import { Mail, Link2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { InviteMode } from "./use-create-invitation-dialog"

/** How the invitation travels (email or a code), the email address, and the position. */
export function InviteContactFields({
  mode,
  setMode,
  email,
  setEmail,
  position,
  onPositionChange,
}: {
  mode: InviteMode
  setMode: (mode: InviteMode) => void
  email: string
  setEmail: (email: string) => void
  position: string
  onPositionChange: (position: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* Method toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{t("invitations.inviteDialog.methodLabel")}</Label>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-lg">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
              mode === "email"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Mail className="h-4 w-4" />
            {t("invitations.inviteDialog.emailLabel")}
          </button>
          <button
            type="button"
            onClick={() => setMode("code")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all",
              mode === "code"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Link2 className="h-4 w-4" />
            {t("invitations.inviteDialog.codeLabel")}
          </button>
        </div>
      </div>

      {/* Email (email mode only) */}
      {mode === "email" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("invitations.inviteDialog.emailLabel")}
          </Label>
          <Input
            type="email"
            placeholder={t("invitations.inviteDialog.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
        </div>
      )}

      {/* Position / title */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("invitations.inviteDialog.positionLabel")}{" "}
          <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
        </Label>
        <Input
          placeholder={t("invitations.inviteDialog.positionPlaceholder")}
          value={position}
          onChange={(e) => onPositionChange(e.target.value)}
          className="h-9"
        />
      </div>
    </>
  )
}
