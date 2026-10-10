"use client"

import { useTranslation } from "react-i18next"

import type { Invoice } from "@/lib/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { LifecycleStep } from "../../_lib/lifecycle"
import { formatCurrency } from "../../_lib/list-format"

/** Confirming the one step with no way back, and confirming a delete. */
export function InvoiceListDialogs({
  sendTarget, setSendTarget, onStatus, deleteTarget, setDeleteTarget, onDelete, deletePending,
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
      <AlertDialog open={!!sendTarget} onOpenChange={(open) => !open && setSendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.markSent.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.markSent.desc", {
                number: sendTarget?.inv.invoiceNumber ?? "",
                client: sendTarget?.inv.clientName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              onClick={() => {
                /* ⚠️ The HELD step's destination, never a literal — the dialog
                   must agree with the button that opened it. */
                const target = sendTarget
                setSendTarget(null)
                if (target) onStatus({ id: target.inv.id, status: target.step.to })
              }}
            >
              {t("invoices.actions.send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoices.delete.title", "Delete this draft invoice?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                t("invoices.delete.desc", {
                  defaultValue:
                    "{{number}} for {{client}} — {{total}} — and all of its line items will be deleted. This cannot be undone.",
                  number: deleteTarget.invoiceNumber,
                  client: deleteTarget.clientName,
                  total: formatCurrency(deleteTarget.total, deleteTarget.currency),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700 focus:ring-red-600"
              disabled={deletePending}
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
