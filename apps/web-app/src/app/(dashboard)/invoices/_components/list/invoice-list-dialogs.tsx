"use client"

import { useTranslation } from "react-i18next"

import type { Invoice } from "@/lib/api"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import type { LifecycleStep } from "../../_lib/lifecycle"
import { formatCurrency } from "../../_lib/list-format"

/** Confirming the one step with no way back, and confirming a delete. */
export function InvoiceListDialogs({
  sendTarget,
  setSendTarget,
  onStatus,
  deleteTarget,
  setDeleteTarget,
  onDelete,
  deletePending,
}: {
  sendTarget: { inv: Invoice; step: LifecycleStep } | null
  setSendTarget: (v: { inv: Invoice; step: LifecycleStep } | null) => void
  onStatus: (v: { id: string; status: string }) => void
  deleteTarget: Invoice | null
  setDeleteTarget: (v: Invoice | null) => void
  onDelete: (id: string) => void
  deletePending: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {/*
        ── Marking it sent: the one step with no way back ────────────────

        ⚠️ And the place to say what this product does NOT do. Nothing here
        emails the invoice — the button records a delivery the person performs
        themselves — and "Mark as sent" reads exactly like a button that sends.
      */}
      <ConfirmDialog
        open={!!sendTarget}
        onOpenChange={(open) => !open && setSendTarget(null)}
        title={t("invoices.markSent.title")}
        description={t("invoices.markSent.desc", {
          number: sendTarget?.inv.invoiceNumber ?? "",
          client: sendTarget?.inv.clientName ?? "",
        })}
        cancelClassName="rounded-lg"
        confirmClassName="rounded-lg"
        confirmLabel={t("invoices.actions.send")}
        onConfirm={() => {
          /* ⚠️ The HELD step's destination, never a literal — the dialog
             must agree with the button that opened it. */
          const target = sendTarget
          setSendTarget(null)
          if (target) onStatus({ id: target.inv.id, status: target.step.to })
        }}
      />

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("invoices.delete.title", "Delete this draft invoice?")}
        description={
          deleteTarget &&
          t("invoices.delete.desc", {
            defaultValue:
              "{{number}} for {{client}} — {{total}} — and all of its line items will be deleted. This cannot be undone.",
            number: deleteTarget.invoiceNumber,
            client: deleteTarget.clientName,
            total: formatCurrency(deleteTarget.total, deleteTarget.currency),
          })
        }
        cancelClassName="rounded-lg"
        destructive
        confirmClassName="rounded-full focus:ring-destructive"
        confirmDisabled={deletePending}
        confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </>
  )
}
