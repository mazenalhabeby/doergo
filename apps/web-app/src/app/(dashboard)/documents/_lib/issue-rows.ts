import type { DocumentTypeRow } from "@/lib/api"
import type { FileMatch } from "@hbcfield/shared/client"

/* A row of the payroll-day batch, and how it is named once filed. */

export type Row = FileMatch & {
  file: File
  state: "pending" | "uploading" | "staged" | "failed"
  progress: number
  documentId?: string
  error?: string
  /** True while the file is being read, so the row can say so rather than sit blank. */
  scanning?: boolean
  /** Its name from its own heading ("Insurance Confirmation Letter"); null = the type's label. */
  docTitle?: string | null
  /** A name somebody typed for this file. Empty = the automatic one above. */
  customTitle?: string
}

export const MONTHS_KEY = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const

/** The name before the period: what was typed, else the file's own heading, else the type. */
export function baseTitle(row: Row, type: DocumentTypeRow | null): string {
  return row.customTitle?.trim() || row.docTitle || type?.label || "Document"
}

/**
 * A title a person would recognise in their own document list.
 *
 * ⚠️ The period is added to a TYPED name too. Twelve payslips renamed
 * "Payslip" must still read as twelve months, not twelve copies of one.
 */
export function titleFor(row: Row, type: DocumentTypeRow | null, t: (k: string) => string): string {
  const label = baseTitle(row, type)
  if (row.periodMonth && row.periodYear) {
    return `${label} ${t(`documents.months.${MONTHS_KEY[row.periodMonth - 1]}`)} ${row.periodYear}`
  }
  if (row.periodYear) return `${label} ${row.periodYear}`
  return label
}
