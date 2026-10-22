import type { ReactNode } from "react"
import type { OrganizationProfile } from "@/lib/api"
import type { IssuerSnapshot } from "@hbcfield/shared/client"

/** The invoice document's shapes: a row, the two frames, the component's props. */

/** One row as the document shows it. */
export interface DocumentRow {
  description: string
  quantity: number
  unitPrice: number
  /**
   * Described but not charged — the jobs listed under a per-person line.
   * Priced at zero by the caller; shown as "included" rather than as €0.00,
   * which reads as a mistake.
   */
  descriptive?: boolean
  taskId?: string | null
  /**
   * HEADING = a work-role heading ("Mechanic"): spans the row, carries no
   * figures and charges nothing. It organizes the page; it can never change
   * what the page adds up to.
   */
  lineKind?: "HOURS" | "DAYS" | "HEADING" | null
  /** HOURS runs: which hours were billed. The working view says so; the client's copy does not. */
  hoursBasis?: "COUNTED" | "CLOCKED" | "SHIFT" | null
  /** HOURS runs: whose time and from which day — lets the screen offer the basis switch on the row. */
  workerId?: string | null
  dayFrom?: string | null
}

export type DocumentView = "build" | "client"

export interface InvoiceDocumentProps {
  view: DocumentView
  onView: (view: DocumentView) => void
  /**
   * Which frames this screen offers.
   *
   * ⚠️ `client` alone for an invoice that has already been issued. The working
   * view is a BUILDING aid — it answers "are these the right lines"; a document
   * that exists has one true form, and offering a second rendering of it
   * invites the question of which one the client got.
   */
  frames?: "both" | "client"

  clientName: string
  clientEmail?: string
  clientAddress?: string

  issueDate: string
  dueDate?: string
  /** Already formatted by the caller — it knows which ends were set. */
  periodLabel?: string
  currency: string
  taxPct: string
  discount: string
  notes?: string

  items: DocumentRow[]
  subtotal: number
  taxAmount: number
  total: number

  /** The number, once it exists. A draft being created has none yet. */
  invoiceNumber?: string | null
  org?: OrganizationProfile
  /**
   * Who it is from — the invoice's company: frozen once issued, live for a draft. Wins over
   * `org`, which is only the fallback for a screen that has no invoice yet.
   */
  issuer?: IssuerSnapshot | null
  /** The real letterhead, where the organisation has uploaded one. */
  logoUrl?: string | null
  /** The HOURS / DAYS tag before each labour line — saved with the invoice. Default shown. */
  showTags?: boolean
  /** Working view: what to show for an hours line's basis (a switch, where the screen can save one). */
  renderBasis?: (row: DocumentRow) => ReactNode
}

/** What both frames of the document read — the props, with the defaults applied. */
export interface DocumentFrameProps {
  /** Which frame is on screen; the other one is rendered and hidden. */
  showing: DocumentView
  invoiceNumber?: string | null
  clientName: string
  clientEmail: string
  clientAddress: string
  issueDate: string
  dueDate?: string
  currency: string
  items: DocumentRow[]
  showTags: boolean
  subtotal: number
  hasDiscount: boolean
  discount: string
  taxPct: string
  taxAmount: number
  total: number
}
