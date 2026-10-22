"use client"

import { useTranslation } from "react-i18next"
import { Building2, Globe, Hash, Landmark, Briefcase, type LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CustomerFormFields } from "./customer-form"

// Common industries for the datalist (smart suggestions, still free-text).
const INDUSTRIES = [
  "Construction",
  "Real Estate",
  "Property Management",
  "Facility Management",
  "Manufacturing",
  "Retail",
  "Hospitality",
  "Healthcare",
  "Logistics",
  "Energy & Utilities",
  "Telecommunications",
  "Automotive",
  "Agriculture",
  "Education",
  "Public Sector",
  "Professional Services",
  "Technology",
]

/** A company's own facts: legal name, website, industry, VAT and register numbers. */
export function CustomerCompanyFields({
  form,
  set,
}: {
  form: CustomerFormFields
  set: (k: keyof CustomerFormFields, v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" /> {t("customers.companyInfo", "Company info")}
      </p>
      <IconField
        icon={Landmark}
        label={t("customers.legalName", "Legal name")}
        placeholder={t("customers.legalNamePh", "Registered entity name")}
        value={form.legalName}
        onChange={(v) => set("legalName", v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <IconField
          icon={Globe}
          label={t("customers.website", "Website")}
          placeholder="example.com"
          value={form.website}
          onChange={(v) => set("website", v)}
        />
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> {t("customers.industry", "Industry")}
          </Label>
          <Input
            list="crm-industries"
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            placeholder={t("customers.industryPh", "e.g. Construction")}
          />
          <datalist id="crm-industries">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <IconField
          icon={Hash}
          label={t("customers.vatId", "VAT / UID no.")}
          placeholder="ATU12345678"
          value={form.vatId}
          onChange={(v) => set("vatId", v)}
        />
        <IconField
          icon={Landmark}
          label={t("customers.regNumber", "Register no.")}
          placeholder={t("customers.regNumberPh", "FN 123456x")}
          value={form.regNumber}
          onChange={(v) => set("regNumber", v)}
        />
      </div>
    </div>
  )
}

function IconField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: LucideIcon
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
