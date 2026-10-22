"use client"

import { Plus, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { copyText } from "@/lib/clipboard"
import { ApartmentDialog, CustomerForm } from "./portal-detail-page-helpers"
import type { PortalDetailPageState } from "../_hooks/use-portal-detail-page"

/** Part of PortalDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function PortalDetailPageInviteResident({ vm }: { vm: PortalDetailPageState }) {
  const {
    inviteOpen,
    resetInvite,
    t,
    code,
    setCopied,
    copied,
    portal,
    customerChoice,
    setCustomerChoice,
    availCustomers,
    availCustomersQ,
    unitChoice,
    setUnitChoice,
    availUnits,
    availUnitsQ,
    setInviteOpen,
    inviteM,
  } = vm
  return (
    <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInvite() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("portal.inviteResident", "Invite client")}</DialogTitle></DialogHeader>
        {code ? (
          <div className="text-center py-4">
            <p
              className="text-sm text-muted-foreground mb-3">{t(
                "portal.shareCode",
                "Share this code with the client to activate their login:")}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-mono font-bold tracking-widest text-foreground rounded-xl bg-muted px-4 py-2">{code}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-11 p-0"
                onClick={async () => { if (await copyText(
                  code)) { setCopied(
                    true); setTimeout(
                      () => setCopied(false),
                      1500) } }}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
            </div>
            <p
              className="text-xs text-muted-foreground mt-3">{t(
                "portal.codeHint",
                "In the app: register → Use Invitation → enter this code.")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p
              className="text-xs text-muted-foreground">{t(
                "portal.inviteHint2",
                ("Pick the client and their {{entity}} — or create either — then share the " +
                  "code. The client sets their own name on sign-up."),
                { entity: (portal?.entityLabel || "unit").toLowerCase() })}</p>

            {/* Client — pick an existing CRM customer, or create one with the
                same customer model (＋ New). */}
            <div className="space-y-1.5">
              <Label>{t("portal.pickCustomer", "Client")}</Label>
              <div className="flex items-center gap-2">
                <select
                  value={customerChoice}
                  onChange={(e) => setCustomerChoice(e.target.value)}
                  className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">{t("portal.pickCustomerPh", "Choose a customer…")}</option>
                  {availCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>
                  ))}
                </select>
                <CustomerForm
                  spaceId={portal?.spaceId ?? undefined}
                  personOnly
                  onSaved={(c) => { availCustomersQ.refetch(); if (c) setCustomerChoice(c.id) }}
                  trigger={<Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />{t("portal.newShort", "New")}</Button>}
                />
              </div>
            </div>

            {/* Entity (apartment / order / workspace…) — pick a vacant one (with
                its location), or create one with the same model, minus the
                Resident picker (＋ New). Copy follows the portal's entity label. */}
            <div className="space-y-1.5">
              <Label>{portal?.entityLabel || t("portal.pickApartment", "Apartment")}</Label>
              <div className="flex items-center gap-2">
                <select
                  value={unitChoice}
                  onChange={(e) => setUnitChoice(e.target.value)}
                  className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option
                    value="">{t(
                      "portal.pickEntityPh",
                      "Choose an available {{entity}}…",
                      { entity: (portal?.entityLabel || "unit").toLowerCase() })}</option>
                  {availUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}{u.address ? ` · ${u.address}` : ""}</option>
                  ))}
                </select>
                {portal?.spaceId && (
                  <ApartmentDialog
                    spaceId={portal.spaceId}
                    hideResident
                    entityLabel={portal?.entityLabel || undefined}
                    onSaved={(u) => { availUnitsQ.refetch(); if (u) setUnitChoice(u.id) }}
                    trigger={<Button
                      type="button"
                      variant="outline"
                      className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />{t("portal.newShort", "New")}</Button>}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {code ? <Button onClick={resetInvite}>{t("common.done", "Done")}</Button> : (
            <>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
              <Button
                disabled={inviteM.isPending || !customerChoice || !unitChoice}
                onClick={() => inviteM.mutate()}
              >
                {t("portal.createInvite", "Create invite")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
