"use client"

import { Briefcase, Building2, Handshake } from "lucide-react"
import type { TFunction } from "i18next"
import { cn } from "@/lib/utils"

/** Who a workspace belongs to — my project / my company / a customer company (a separate axis from its type). */
type OwnershipKind = "PROJECT" | "COMPANY" | "CUSTOMER"

/** The three choices, read by the new-workspace form and a workspace's General tab. */
export function ownershipKindOptions(t: TFunction) {
  return [
    { value: "PROJECT" as const, icon: Briefcase, label: t("locations.form.kindProject", "My project") },
    { value: "COMPANY" as const, icon: Building2, label: t("locations.form.kindCompany", "My company") },
    { value: "CUSTOMER" as const, icon: Handshake, label: t("locations.form.kindCustomer", "Customer company") },
  ]
}

/** The row of ownership cards — one copy for both screens that offer it. */
export function OwnershipKindPicker({
  options,
  kind,
  onPick,
}: {
  options: ReturnType<typeof ownershipKindOptions>
  kind: OwnershipKind
  onPick: (kind: OwnershipKind) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const Icon = opt.icon
        const active = kind === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPick(opt.value)}
            className={cn(
              "rounded-xl border p-3 text-left transition-all",
              active
                ? "border-primary bg-shell-accent-soft ring-1 ring-primary/20"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className="h-4 w-4 text-shell-accent" /> {opt.label}
            </div>
          </button>
        )
      })}
    </div>
  )
}
