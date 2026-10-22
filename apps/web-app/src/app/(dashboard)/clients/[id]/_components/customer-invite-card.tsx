"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Send, Copy, Check, Smartphone, CheckCircle2, Building2 } from "lucide-react"

import { customersApi, spacePortalApi, type Customer, type PortalSummary } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { copyText } from "@/lib/clipboard"

// ── Invite card ──────────────────────────────────────────────────────────────
export function InviteCard({ customer, hasB2C, onChanged }: { customer: Customer; hasB2C: boolean; onChanged: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const invite = useMutation({
    mutationFn: (portalId?: string) => customersApi.invite(customer.id, portalId ? { portalId } : undefined),
    onSuccess: (res) => { setCode(
      res.code ?? null); setPickerOpen(false); notify.success(t("customers.invited", "Invite sent")); onChanged() },
    onError: (e: Error) => notify.error(e.message || "Could not invite"),
  })
  const copy = async () => { if (code && (await copyText(code))) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  // The portal decides the client's entity AND their categories. Fetch this
  // space's portals so we can auto-bind (one portal) or let the office choose
  // (several). Only relevant while inviting a not-yet-bound customer.
  const portalsQ = useQuery({
    queryKey: keys.spaces.portals(customer.spaceId),
    queryFn: () => spacePortalApi.listPortals(customer.spaceId!),
    enabled: hasB2C && !!customer.spaceId && !customer.isPortalResident,
  })
  const portals = portalsQ.data ?? []
  // Need a choice only when the space runs >1 portal AND the customer isn't
  // already bound to one (an assigned unit/portal decides it on the backend).
  const needsPortalChoice = portals.length > 1 && !customer.portalId
  const onInviteClick = () => (needsPortalChoice ? setPickerOpen(true) : invite.mutate(undefined))

  return (
    <div className={cn("rounded-2xl border p-4",
      customer.isPortalResident
        ? ("border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 " + "dark:bg-emerald-950/20")
        : "border-border/70 bg-card")}>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" /> {t("customers.appAccessTitle", "App access")}
      </p>
      {/* A freshly generated code wins over the "has app" state so the office
          can actually copy/share it right after inviting. */}
      {code ? (
        <div className="space-y-2 text-center">
          <button
            onClick={copy}
            className={"mx-auto flex items-center gap-2 rounded-lg border border-border " +
              "bg-background px-4 py-2.5 font-mono text-lg font-semibold " +
              "tracking-widest"}>
            {code} {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          </button>
          <p
            className="text-xs text-muted-foreground">{t(
              "customers.inviteShare",
              "Share this code (or the emailed link) so they can sign in.")}</p>
        </div>
      ) : customer.app?.accepted ? (
        // Accepted — a real login exists. Show it + which entity they use.
        <div className="space-y-1.5">
          <p
            className={"flex items-center gap-2 text-sm font-medium text-emerald-700 " +
              "dark:text-emerald-400"}><CheckCircle2 className="h-4 w-4" /> {t("customers.appActive", "Active — signed in to the app")}</p>
          {customer.app?.entityLabel && (
            <p
              className="text-xs text-muted-foreground">{t(
                "customers.appEntity",
                "Access: {{entity}}{{portal}}",
                { entity: customer.app.entityLabel, portal: customer.app.portalName ? ` · ${customer.app.portalName}` : "" })}</p>
          )}
        </div>
      ) : customer.isPortalResident ? (
        // Invited but not yet accepted — waiting for them to sign up.
        <div className="space-y-2">
          <p
            className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400"><Send
              className="h-3.5 w-3.5"
            /> {t("customers.appInvited", "Invited — waiting for them to sign up.")}</p>
          {customer.app?.entityLabel && (
            <p
              className="text-xs text-muted-foreground">{t(
                "customers.appEntity",
                "Access: {{entity}}{{portal}}",
                { entity: customer.app.entityLabel, portal: customer.app.portalName ? ` · ${customer.app.portalName}` : "" })}</p>
          )}
          <Button variant="outline" size="sm" className="w-full" disabled={invite.isPending} onClick={() => invite.mutate(undefined)}>
            <Send
              className="mr-1.5 h-3.5 w-3.5"
            /> {invite.isPending ? t("common.saving", "Working…") : t("customers.resendCode", "Resend invite code")}
          </Button>
        </div>
      ) : hasB2C ? (
        <>
          <p
            className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{t(
              "customers.inviteIntro",
              "Give this customer a login to order & follow their jobs.")}</p>
          <Button className="w-full" disabled={invite.isPending} onClick={onInviteClick}>
            <Send className="mr-1.5 h-4 w-4" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.invite", "Invite to app")}
          </Button>

          {/* Portal picker — only when the space runs several portals. The chosen
              portal decides the client's entity + which categories they see. */}
          <Dialog open={pickerOpen} onOpenChange={(o) => { if (!invite.isPending) setPickerOpen(o) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("customers.pickPortalTitle", "Which portal should they use?")}</DialogTitle>
              </DialogHeader>
              <p
                className="text-xs text-muted-foreground">{t(
                  "customers.pickPortalHint",
                  ("This space runs several portals. The one you pick decides the client's " +
                    "entity and the categories they can report."))}</p>
              <div className="mt-1 space-y-1.5">
                {portals.map((p: PortalSummary) => (
                  <button key={p.id} type="button" disabled={invite.isPending} onClick={() => invite.mutate(p.id)}
                    className={"flex w-full items-center gap-3 rounded-lg border border-border p-3 " +
                      "text-left transition-colors hover:border-primary hover:bg-muted/50 " +
                      "disabled:opacity-60"}>
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t(
                          "customers.pickPortalMeta",
                          "{{entity}} · {{count}} categories",
                          { entity: p.entityLabel, count: p.categoryCount })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <Button className="w-full" disabled><Send className="mr-1.5 h-4 w-4" /> {t("customers.invite", "Invite to app")}</Button>
          <p
            className="mt-2 text-xs leading-relaxed text-muted-foreground">🔒 {t(
              "customers.needB2C",
              ("Turn on the B2C Portal module (workspace Modules tab) to invite " + "customers."))}</p>
        </>
      )}
    </div>
  )
}
