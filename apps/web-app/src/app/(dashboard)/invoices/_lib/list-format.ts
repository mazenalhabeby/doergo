import { formatAmount } from "@/lib/money"

export function formatCurrency(amount: number, currency = "USD") {
  // An invoice is a record: the pinned money locale (lib/money.ts), so the list
  // reads exactly like the invoice it links to.
  return formatAmount(amount, currency)
}

