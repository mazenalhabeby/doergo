"use client"

import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Handshake } from "lucide-react"
import { OwnershipKindPicker, ownershipKindOptions } from "../../_components/ownership-kind-picker"
import { keys } from "@/lib/query-keys"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi, rateHistoryApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { CompanyField, companyName, useCompanies } from "@/components/companies/company-select"
import { notify } from "@/lib/toast"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { serverErrorMessage } from "@/lib/server-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Kind = "PROJECT" | "COMPANY" | "CUSTOMER"

/**
 * Project, own company or customer company. A customer company also carries its contact, its currency,
 * its hourly bill rate and the company that invoices it — those four are saved on their own, not by Save.
 */
export function OwnershipCard({
  space,
  kind,
  setKind,
  contactName,
  setContactName,
  contactEmail,
  setContactEmail,
  contactPhone,
  setContactPhone,
}: {
  space: CompanyLocation
  kind: Kind
  setKind: (kind: Kind) => void
  contactName: string
  setContactName: (v: string) => void
  contactEmail: string
  setContactEmail: (v: string) => void
  contactPhone: string
  setContactPhone: (v: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgCurrency = user?.orgCurrency ?? "EUR"
  const KIND_OPTIONS = ownershipKindOptions(t)
  // This workspace's rates and their history, read only where they are shown (a client).
  const { data: spaceRates } = useQuery({
    queryKey: keys.rates.history("SPACE", space.id),
    queryFn: () => rateHistoryApi.list({ target: "SPACE", targetId: space.id }),
    enabled: space.kind === "CUSTOMER",
  })
  const saveSpaceRate = async (patch: UpdateLocationInput) => {
    await locationsApi.update(space.id, patch)
    queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("SPACE", space.id) })
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 " +
              "text-amber-600 dark:bg-amber-950 dark:text-amber-300"
            }
          >
            <Handshake className="h-[18px] w-[18px]" />
          </span>
          <div>
            <CardTitle className="text-base">{t("locations.ownershipSection", "Ownership")}</CardTitle>
            <CardDescription>
              {t(
                "locations.ownershipHint",
                "Is this a project, your own company, or a customer company you do work " + "for?",
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <OwnershipKindPicker options={KIND_OPTIONS} kind={kind} onPick={setKind} />
        {kind === "CUSTOMER" && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("locations.form.customerContact", "Customer contact")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-contact-name">{t("locations.form.contactName", "Contact name")}</Label>
              <Input id="cfg-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-contact-email">{t("locations.form.contactEmail", "Contact email")}</Label>
                <Input
                  id="cfg-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
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
                onSubmit={(c, from) =>
                  saveSpaceRate({ billableRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })
                }
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
        {kind === "CUSTOMER" && (
          <WorkspaceCompanyField
            value={space.legalEntityId ?? null}
            onSave={async (id) => {
              try {
                await saveSpaceRate({ legalEntityId: id })
                notify.success(t("companies.saved"))
              } catch (e) {
                notify.error(serverErrorMessage(e, t))
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** "Invoices issued by" for this workspace; null follows the main company. */
function WorkspaceCompanyField({ value, onSave }: { value: string | null; onSave: (id: string | null) => void }) {
  const { t } = useTranslation()
  const { main } = useCompanies()
  return (
    <CompanyField
      id="cfg-company"
      label={t("companies.issuedBy")}
      help={t("companies.issuedByWorkspaceHelp")}
      value={value}
      onChange={onSave}
      inheritLabel={t("companies.sameAsMain", { name: companyName(main) })}
    />
  )
}
