"use client"

import { useTranslation } from "react-i18next"
import { Building2, Smartphone, Users } from "lucide-react"

import type { Customer } from "@/lib/api"
import { personInitials } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { clientLocaleName } from "@/lib/client-locale"
import { Chip } from "@/components/page/page-kit"
import { fmtDate } from "../_lib/customer-record-lib"
import { Panel, PanelHead, PropRow } from "./customer-record-bits"

/** Who the client is: the soft avatar (square for a company, round for a person), the name and its tags. */
export function RecordIdentity({ customer }: { customer: Customer }) {
  const { t } = useTranslation()
  const isCompany = customer.type === "COMPANY"
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "flex size-16 shrink-0 items-center justify-center bg-shell-accent-soft text-xl font-bold text-shell-accent",
          isCompany ? "rounded-2xl" : "rounded-full",
        )}
      >
        {isCompany ? <Building2 className="h-6 w-6" /> : personInitials(customer.name)}
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[30px]">
          {customer.name}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip>
            {isCompany ? (
              <>
                <Building2 className="size-3" /> {t("customers.typeCompany", "Company")}
              </>
            ) : (
              <>
                <Users className="size-3" /> {t("customers.typePerson", "Person")}
              </>
            )}
          </Chip>
          {customer.industry && <span className="text-[12.5px] text-muted-foreground">{customer.industry}</span>}
          {customer.isPortalResident && !isCompany && (
            <Chip tone="accent">
              <Smartphone className="size-3" /> {t("customers.appAccess", "App access")}
            </Chip>
          )}
        </div>
      </div>
    </div>
  )
}

/** The facts of the record — the left column's first panel. */
export function AboutPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation()
  const isCompany = customer.type === "COMPANY"
  const website = customer.website
  const websiteHref = website ? (website.startsWith("http") ? website : `https://${website}`) : undefined
  return (
    <Panel>
      <PanelHead>{t("customers.about", "About")}</PanelHead>
      <dl className="divide-y divide-border text-sm">
        <PropRow
          label={isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")}
          value={customer.email}
          href={customer.email ? `mailto:${customer.email}` : undefined}
        />
        <PropRow
          label={isCompany ? t("customers.companyPhone", "Company phone") : t("customers.phone", "Phone")}
          value={customer.phone}
          href={customer.phone ? `tel:${customer.phone}` : undefined}
        />
        {isCompany && (
          <>
            <PropRow
              label={t("customers.website", "Website")}
              value={website?.replace(/^https?:\/\//, "")}
              href={websiteHref}
            />
            <PropRow label={t("customers.legalName", "Legal name")} value={customer.legalName} />
            <PropRow label={t("customers.industry", "Industry")} value={customer.industry} />
            <PropRow label={t("customers.vatId", "VAT / UID")} value={customer.vatId} />
            <PropRow label={t("customers.regNumber", "Register no.")} value={customer.regNumber} />
          </>
        )}
        {/* Always shown: "not set" still decides something, and the office should see what. */}
        <PropRow
          label={t("customers.locale", "Language for emails")}
          value={clientLocaleName(customer.locale) ?? t("customers.localeSame", "Same as the organization")}
        />
        {(customer.details ?? [])
          .filter((d) => d.label && d.value)
          .map((d, i) => (
            <PropRow key={i} label={d.label} value={d.value} />
          ))}
        <PropRow label={t("customers.added", "Added")} value={fmtDate(customer.createdAt)} />
      </dl>
      {customer.notes && (
        <p className={"mt-3 rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed " + "text-muted-foreground"}>
          {customer.notes}
        </p>
      )}
    </Panel>
  )
}
