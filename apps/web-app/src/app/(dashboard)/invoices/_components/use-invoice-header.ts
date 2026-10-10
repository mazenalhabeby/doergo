import { useMemo, useState, type SetStateAction } from "react"
import { num } from "./invoice-fields"

/** The invoice's header as the form holds it — strings, the way the inputs edit them. */
export interface InvoiceHeader {
  clientName: string
  clientEmail: string
  clientAddress: string
  issueDate: string
  dueDate: string
  currency: string
  taxPct: string
  discount: string
  notes: string
}

const EMPTY: InvoiceHeader = {
  clientName: "",
  clientEmail: "",
  clientAddress: "",
  issueDate: "",
  dueDate: "",
  currency: "EUR",
  taxPct: "",
  discount: "",
  notes: "",
}

type Setter = (v: SetStateAction<string>) => void

/**
 * The header of an invoice being written or corrected — ONE state for both
 * screens. The new and edit pages each declared these ten fields by hand.
 *
 * Returns each value and a `setX` under the names the field components take,
 * so a page reads exactly as before. The setters are stable (memoised over the
 * functional update), so an effect that lists one does not re-run every render.
 */
export function useInvoiceHeader(initial: Partial<InvoiceHeader> = {}) {
  const [header, setHeader] = useState<InvoiceHeader>(() => ({ ...EMPTY, ...initial }))
  const setters = useMemo(() => {
    const set =
      (key: keyof InvoiceHeader): Setter =>
      (v) =>
        setHeader((prev) => ({ ...prev, [key]: typeof v === "function" ? v(prev[key]) : v }))
    return {
      setClientName: set("clientName"),
      setClientEmail: set("clientEmail"),
      setClientAddress: set("clientAddress"),
      setIssueDate: set("issueDate"),
      setDueDate: set("dueDate"),
      setCurrency: set("currency"),
      setTaxPct: set("taxPct"),
      setDiscount: set("discount"),
      setNotes: set("notes"),
      /** Replace several fields at once — an invoice loaded for editing. */
      loadHeader: (next: Partial<InvoiceHeader>) => setHeader((prev) => ({ ...prev, ...next })),
    }
  }, [])
  return { ...header, ...setters, header }
}

/**
 * The header fields every save sends, cleaned the one way: names trimmed,
 * empty optional fields omitted (a cleared due date then reads "On receipt"
 * rather than an invented term), the discount read as a number.
 *
 * Tax and the issue date are left to the page: a new invoice defaults an empty
 * tax to 0 % and always has a date; a corrected draft keeps what it had.
 */
export function invoiceHeaderBody(h: InvoiceHeader) {
  return {
    clientName: h.clientName.trim(),
    clientEmail: h.clientEmail.trim() || undefined,
    clientAddress: h.clientAddress.trim() || undefined,
    currency: h.currency,
    dueDate: h.dueDate || undefined,
    discount: num(h.discount),
    notes: h.notes.trim() || undefined,
  }
}
