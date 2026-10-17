"use client"

import { Handshake } from "lucide-react"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { serverErrorMessage } from "@/lib/server-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkspaceCompanyField } from "./general-tab-helpers"
import type { GeneralTabState } from "./use-general-tab"
import type { GeneralTab } from "./general-tab"

/** Part of GeneralTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function GeneralTabOwnershipSection({ vm, space }: { vm: GeneralTabState; space: Parameters<typeof GeneralTab>[0]['space'] }) {
  const {
    t,
    KIND_OPTIONS,
    kind,
    setKind,
    contactName,
    setContactName,
    contactEmail,
    setContactEmail,
    contactPhone,
    setContactPhone,
    orgCurrency,
    saveSpaceRate,
    spaceRates,
  } = vm
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
            <Handshake className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-base">{t("locations.ownershipSection", "Ownership")}</CardTitle>
            <CardDescription>{t("locations.ownershipHint", "Is this a project, your own company, or a customer company you do work for?")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KIND_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = kind === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                    : "border-border hover:border-muted-foreground/30",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-blue-600" /> {opt.label}
                </div>
              </button>
            )
          })}
        </div>
        {kind === "CUSTOMER" && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("locations.form.customerContact", "Customer contact")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-contact-name">{t("locations.form.contactName", "Contact name")}</Label>
              <Input id="cfg-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-contact-email">{t("locations.form.contactEmail", "Contact email")}</Label>
                <Input id="cfg-contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-contact-phone">{t("locations.form.contactPhone", "Contact phone")}</Label>
                <Input id="cfg-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
            {/*
              What this client pays per hour, and what an hour here costs you.
              Each changes from a day and keeps its history — never part of
              the Save above, which would otherwise date every edit "today".
            */}
            {/*
              What this client is billed in. Every rate on this workspace is
              in it; a worker's cost stays in the organization's currency.
            */}
            <CurrencySetting
              id="cfg-currency"
              label={t("currency.spaceLabel")}
              hint={t("currency.spaceHint")}
              value={space.currency ?? null}
              inheritFrom={space.organizationCurrency ?? orgCurrency}
              ratesSet={space.ratesSet ?? 0}
              onSave={(code) => saveSpaceRate({ currency: code })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {/* What the client pays per hour. What a person COSTS is on their profile, not here. */}
              <DatedRateField
                id="cfg-billable-rate"
                label={t("rates.spaceBill")}
                hint={t("rates.spaceBillHint")}
                currentCents={space.billableRateCents ?? null}
                currency={space.effectiveCurrency ?? orgCurrency}
                history={spaceRates?.filter((r) => r.kind === "BILL_HOUR")}
                onSubmit={(c, from) => saveSpaceRate({ billableRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })}
              />
            </div>
          </div>
        )}
        {/*
          Who invoices this workspace — the legal company on its invoices (customer workspaces are
          the ones invoiced). Saved on its own, like
          the currency; issued invoices keep the company frozen on them. Hidden while the
          organization has one company.
        */}
        {kind === "CUSTOMER" && <WorkspaceCompanyField
          value={space.legalEntityId ?? null}
          onSave={async (id) => {
            try {
              await saveSpaceRate({ legalEntityId: id })
              notify.success(t("companies.saved"))
            } catch (e) {
              notify.error(serverErrorMessage(e, t))
            }
          }}
        />}
      </CardContent>
    </Card>
  )
}
