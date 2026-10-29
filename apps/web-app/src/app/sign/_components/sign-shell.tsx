"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Clock, FileText, Loader2, Mail } from "lucide-react"
import { signLinkApi } from "@/lib/api"
import type { LinkRefusal } from "@/lib/api/types/sign-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The page frame. Deliberately plain — a client has never seen this product. */
export function Shell({ children, org, subtitle }: { children: React.ReactNode; org?: string; subtitle?: string }) {
  return (
    <main className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 text-center">
          <span className="text-lg font-bold tracking-tight text-primary">HBC FIELD</span>
          {org && <p className="mt-1 text-sm text-muted-foreground">{org}</p>}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">{children}</div>
      </div>
    </main>
  )
}

/**
 * A link that does not work.
 *
 * Expired earns an offer of a new one; unknown says nothing at all. They render
 * differently on purpose and the SERVER already decided which — a page that
 * guessed would be a way to find out whether an address is a client here.
 */
export function Refused({ refusal }: { refusal: LinkRefusal }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (refusal === "unknown") {
    return (
      <div className="text-center">
        <FileText className="mx-auto h-9 w-9 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{t("signLink.invalid.title", "This link is not valid")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "signLink.invalid.body",
            "Check the address in the email, or ask the company that sent it for a new link.",
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <Clock className="mx-auto h-9 w-9 text-amber-600" />
      <h1 className="mt-3 text-lg font-semibold">
        {refusal === "lost"
          ? t("signLink.lost.title", "Ask for a new link")
          : t("signLink.expired.title", "This link has expired")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {refusal === "lost"
          ? t(
              "signLink.lost.body",
              "Enter the address our email was sent to and we will send a new link. Any earlier link stops working.",
            )
          : t(
              "signLink.expired.body",
              "Your documents are still here. Enter the address this was sent to and we will send a new link.",
            )}
      </p>

      {sent ? (
        <p className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("signLink.expired.sent", "If that address has documents with us, a link is on its way.")}
        </p>
      ) : (
        <div className="mx-auto mt-5 max-w-xs space-y-2 text-left">
          <Label htmlFor="reissue-email" className="text-xs">
            {t("signLink.expired.email", "Your email address")}
          </Label>
          <Input
            id="reissue-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <Button
            className="w-full"
            disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true)
              // Always the same outcome on screen, whatever happened. The
              // response cannot vary with whether the address is known, or this
              // becomes a way to discover who works with whom.
              try {
                await signLinkApi.resend(email)
              } catch {
                /* say nothing */
              }
              setSent(true)
              setBusy(false)
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {t("signLink.expired.send", "Send me a new link")}
          </Button>
        </div>
      )}
    </div>
  )
}
