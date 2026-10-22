"use client"

import { useTranslation } from "react-i18next"
import { documentIssuer, invoiceDocumentLabels } from "@/lib/invoice-document-locale"
import { ViewToggle } from "./document-shared"
import { WorkingSheet } from "./working-sheet"
import { ClientCopy } from "./client-copy"
import type { DocumentFrameProps, DocumentView, InvoiceDocumentProps } from "./invoice-document-types"
export { money, fmtDate } from "./document-shared"
export { type DocumentView, type DocumentRow, type InvoiceDocumentProps } from "./invoice-document-types"

/**
 * The invoice, as a document.
 *
 * ⚠️ NOT A "PREVIEW CARD" AMONG OTHER CARDS — the invoice, laid out as one.
 * Somebody building a bill is trying to answer "what will the client receive",
 * and a stack of form panels never answers it. A sheet does, and it makes a
 * wrong line obvious at a glance.
 *
 * ⚠️ ONE COMPONENT FOR BOTH SCREENS. Creating an invoice and correcting one are
 * the same question about the same artefact; two renderings of it would be two
 * places for the arithmetic, the column order and the empty state to drift, and
 * the drift is invisible until somebody holds a document that disagrees with
 * the screen it was made on.
 *
 * ⚠️ Both views fill their tables from the SAME rows. The client's copy is not
 * a second rendering with its own idea of the numbers — it is the same document
 * in a different frame, which is the only version of this that cannot lie.
 */

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const { i18n } = useTranslation()
  const {
    view,
    onView,
    frames = "both",
    clientName,
    clientEmail = "",
    clientAddress = "",
    issueDate,
    dueDate,
    periodLabel,
    currency,
    taxPct,
    discount,
    notes = "",
    items,
    subtotal,
    taxAmount,
    total,
    invoiceNumber,
    org,
    issuer,
    logoUrl: orgLogo,
  } = props
  // The same builder the PDF uses, in the screen's language.
  const from = documentIssuer(issuer, org ?? null, invoiceDocumentLabels(i18n.language))
  const logoUrl = from.logoUrl ?? orgLogo
  const showing: DocumentView = frames === "client" ? "client" : view
  const hasDiscount = Number(discount) > 0
  const frame: DocumentFrameProps = {
    showing,
    invoiceNumber,
    clientName,
    clientEmail,
    clientAddress,
    issueDate,
    dueDate,
    currency,
    items,
    showTags: props.showTags !== false,
    subtotal,
    hasDiscount,
    discount,
    taxPct,
    taxAmount,
    total,
  }

  return (
    <>
      {frames === "both" && <ViewToggle view={view} onView={onView} />}

      {/*
        ⚠️ BOTH SHEETS ARE RENDERED AND ONE IS HIDDEN, rather than swapped.
        Switching frames must not re-run the arithmetic or lose a scroll
        position — and a mounted-then-unmounted table is also where a
        "preview" acquires its own state.
      */}
      <WorkingSheet {...frame} renderBasis={props.renderBasis} />

      {/*
        THE CLIENT'S COPY — the only surface in this product a customer ever
        sees, and deliberately NOT styled like the app.

        ⚠️ No cards, no muted panels, no UI chrome. Anything that reads as
        software here tells the recipient they are looking at somebody's
        dashboard rather than at a bill. It carries what a real invoice has to
        carry: a letterhead, a number, both parties, terms, and how to pay.
      */}
      <ClientCopy {...frame} from={from} logoUrl={logoUrl} periodLabel={periodLabel} notes={notes} />
    </>
  )
}
