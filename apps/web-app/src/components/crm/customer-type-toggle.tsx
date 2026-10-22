"use client"

import { useTranslation } from "react-i18next"
import { User, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

/** Person or Company — a segmented toggle. */
export function CustomerTypeToggle({
  type,
  setType,
}: {
  type: "PERSON" | "COMPANY"
  setType: (type: "PERSON" | "COMPANY") => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {(
        [
          ["PERSON", User, t("customers.typePerson", "Person")],
          ["COMPANY", Building2, t("customers.typeCompany", "Company")],
        ] as const
      ).map(([val, Icon, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => setType(val)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            type === val ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" /> {label}
        </button>
      ))}
    </div>
  )
}
