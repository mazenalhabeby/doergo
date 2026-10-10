import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import type { MemberStatement } from "./api"
import { formatHoursMinutes } from "@hbcfield/shared/client"
import { PDF_PALETTE, PDF_TABLE_THEME } from "./pdf-common"
import { fileNamePart, pdfFileName, periodPart } from "./pdf-filename"

/**
 * A worker's statement as a PDF — the same family as the invoice (palette,
 * margins, table style), so the two documents a member and a client hold for
 * the same month read as one product.
 *
 * Labels arrive translated from the screen; this only lays them out.
 */
interface StatementPdfLabels {
  title: string
  member: string
  period: string
  workspace: string
  days: string
  hours: string
  rate: string
  amount: string
  total: string
  noWorkspace: string
  noRate: string
  generated: string
}

export function exportStatementPdf(
  s: MemberStatement,
  labels: StatementPdfLabels,
  fmt: { money: (cents: number) => string; period: string; today: string },
): void {
  const { INK, MUTED } = PDF_PALETTE
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16

  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text(s.organizationName ?? "", margin, margin + 5)
  doc.setFontSize(20)
  doc.text(labels.title.toUpperCase(), pageW - margin, margin + 6, { align: "right" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
  let y = margin + 20
  for (const [label, value] of [
    [labels.member, s.member.name],
    [labels.period, fmt.period],
    [labels.generated, fmt.today],
  ]) {
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b)
    doc.text(label, margin, y)
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text(value, margin + 32, y)
    y += 5.5
  }

  autoTable(doc, {
    startY: y + 4,
    head: [[labels.workspace, labels.days, labels.hours, labels.rate, labels.amount]],
    body: s.lines.map((l) => [
      l.spaceName ?? labels.noWorkspace,
      l.basis === "days" ? String(l.days ?? "") : l.spaceId && s.daysBySpace[l.spaceId] != null ? String(s.daysBySpace[l.spaceId]) : "",
      formatHoursMinutes(l.hours),
      l.rateCents == null ? labels.noRate : fmt.money(l.rateCents),
      fmt.money(l.amountCents),
    ]),
    foot: [[labels.total, "", formatHoursMinutes(s.totalHours), "", fmt.money(s.totalCents)]],
    ...PDF_TABLE_THEME,
    footStyles: { fillColor: [248, 250, 252], textColor: [INK.r, INK.g, INK.b], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  })

  doc.save(pdfFileName([fileNamePart(s.member.name), fileNamePart(labels.title), periodPart(s.from, s.to)], "statement"))
}
