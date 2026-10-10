"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

/** "Also add them as a client" — rendered by the page only where the CRM, the right and the source allow it. */
export function AddToCrmOption({
  clientName, addToCrm, setAddToCrm,
}: {
  clientName: string
  addToCrm: boolean
  setAddToCrm: (v: boolean) => void
}) {
  const { t } = useTranslation()
  return (
                    <label
                      className={cn(
                        "mt-2 flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                        clientName.trim().length > 1
                          ? "cursor-pointer border-border hover:border-slate-400"
                          : "border-dashed border-border opacity-60",
                      )}
                    >
                      <Checkbox
                        className="mt-0.5"
                        disabled={clientName.trim().length <= 1}
                        checked={addToCrm}
                        onCheckedChange={(v) => setAddToCrm(v === true)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-foreground">{t("invoices.create.alsoAddClient")}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {clientName.trim().length > 1
                            ? t("invoices.create.alsoAddClientWhen", { name: clientName.trim() })
                            : t("invoices.create.alsoAddClientNeedsName")}
                        </span>
                      </span>
                    </label>
  )
}
