"use client"

import { formatAmount } from "@/lib/money"

/** InvoiceDetailInner's module-level helpers, moved here unchanged so its sections can read them too. */
export function money(n: number, currency: string) {
  return formatAmount(n, currency)
}
