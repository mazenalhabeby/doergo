"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { CompanyField, companyName, useCompanies } from "@/components/companies/company-select"

/** GeneralTab's module-level helpers, moved here unchanged so its sections can read them too. */
// The same map picker used by the New-Space form — reused so the address
// experience is identical (DRY). Dynamic-imported because Leaflet needs `window`.
export const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

/** "Invoices issued by" for this workspace; null follows the main company. */
export function WorkspaceCompanyField({ value, onSave }: { value: string | null; onSave: (id: string | null) => void }) {
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
