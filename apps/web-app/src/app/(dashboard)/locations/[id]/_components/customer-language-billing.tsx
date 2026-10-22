"use client"

import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import type { LegalEntity } from "@/lib/api"
import { CurrencySelect } from "@/components/rates/currency-setting"
import { CompanyField, companyName } from "@/components/companies/company-select"
import { CLIENT_LOCALE_OPTIONS } from "@/lib/client-locale"
import { Label } from "@/components/ui/label"

/** The language a client's emails are written in, and — outside a workspace — their invoices' currency and issuer. */
export function CustomerLanguageBilling({
  locale,
  setLocale,
  currency,
  setCurrency,
  legalEntityId,
  setLegalEntityId,
  mainCompany,
}: {
  locale: string
  setLocale: (v: string) => void
  currency: string | null
  setCurrency: (v: string | null) => void
  legalEntityId: string | null
  setLegalEntityId: (v: string | null) => void
  mainCompany: LegalEntity | null | undefined
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  return (
    <>
      {/*
        Beside the address it belongs to: this decides what the emails sent
        to that address read like. Client info, so it saves under the same
        permission as the phone number — nothing of its own.
      */}
      <div className="space-y-1">
        <Label htmlFor="client-locale">{t("customers.locale", "Language for emails")}</Label>
        <select
          id="client-locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
          className={
            "h-9 w-full rounded-md border border-input bg-background px-3 text-sm " +
            "text-foreground focus-visible:outline-none focus-visible:ring-1 " +
            "focus-visible:ring-ring"
          }
        >
          <option value="">{t("customers.localeSame", "Same as the organization")}</option>
          {CLIENT_LOCALE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          {t(
            "customers.localeHint",
            "Invitations and signing links to this client are written in this " +
              "language. If the client picked a language in the app, that one is used. " +
              "With “Same as the organization”, emails follow your organization’s " +
              "country, otherwise English.",
          )}
        </p>
      </div>

      {/* What invoices to this client are written in, outside a workspace. */}
      <div className="space-y-1">
        <Label htmlFor="client-currency">{t("currency.clientLabel")}</Label>
        <CurrencySelect
          id="client-currency"
          value={currency}
          onChange={setCurrency}
          inheritFrom={user?.orgCurrency ?? "EUR"}
          className="h-9 rounded-md"
        />
        <p className="text-[11px] text-muted-foreground">{t("currency.clientHint")}</p>
      </div>

      {/* Who invoices this client outside a workspace. Hidden while there is one company. */}
      <CompanyField
        id="client-company"
        label={t("companies.issuedBy")}
        help={t("companies.issuedByClientHelp")}
        value={legalEntityId}
        onChange={setLegalEntityId}
        inheritLabel={t("companies.sameAsMain", { name: companyName(mainCompany) })}
      />
    </>
  )
}
