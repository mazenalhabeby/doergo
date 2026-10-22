"use client"

import { useTranslation } from "react-i18next"
import { Copy, Check, CheckCircle2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { InviteMode } from "./use-create-invitation-dialog"

/** After creating: the email was sent (with the code in it) or the code to share, and what next. */
export function InvitationCreated({
  open,
  onClose,
  mode,
  email,
  generatedCode,
  codeCopied,
  onCopyCode,
  onSendAnother,
}: {
  open: boolean
  onClose: () => void
  mode: InviteMode
  email: string
  generatedCode: string
  codeCopied: boolean
  onCopyCode: () => void
  onSendAnother: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitations.inviteDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "email" && email ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t("invitations.inviteDialog.invitationSent")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("invitations.inviteDialog.emailSentToPrefix")}{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <div className="bg-muted/60 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">{t("invitations.inviteDialog.codeAlsoInEmail")}</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-xl font-mono font-bold tracking-[0.15em] text-foreground">{generatedCode}</p>
                  <Button variant="ghost" size="icon" onClick={onCopyCode} className="h-7 w-7">
                    {codeCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t("invitations.inviteDialog.codeCreated")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("invitations.inviteDialog.shareCode")}</p>
              </div>
              <div className="bg-muted/60 rounded-xl p-5">
                <p className="text-3xl font-mono font-bold tracking-[0.2em] text-foreground">{generatedCode}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onSendAnother} className="flex-1 rounded-lg">
              {mode === "email"
                ? t("invitations.inviteDialog.sendAnother")
                : t("invitations.inviteDialog.createAnother")}
            </Button>
            {mode === "code" && (
              <Button variant="outline" onClick={onCopyCode} className="rounded-lg">
                {codeCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-1.5 text-green-600" />
                    {t("common.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1.5" />
                    {t("common.copy")}
                  </>
                )}
              </Button>
            )}
            <Button onClick={onClose} className="flex-1 rounded-lg">
              {t("common.done")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
