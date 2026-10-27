"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Loader2 } from "lucide-react"
import type { ApprovalItem } from "@hbcfield/shared/client"

import { assetsApi, documentsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"

/**
 * The paper behind a decision — a document to verify, a receipt, a page sent in
 * to become an asset. Nobody verifies what they cannot see. The link is minted
 * on the tap (each kind's own POST, which is the "opened" record), never listed.
 */
export function ViewFile({ item }: { item: ApprovalItem }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const mint =
    item.kind === "document"
      ? () => documentsApi.downloadUrl(item.id)
      : item.kind === "expense" && item.data.hasReceipt
        ? () => assetsApi.getReceiptUrl(item.id)
        : item.kind === "assetProposal"
          ? () => assetsApi.getProposalDocumentUrl(item.id)
          : null
  if (!mint) return null
  const open = async () => {
    // Opened before the await, or the browser treats the later window as a pop-up.
    const tab = window.open("", "_blank")
    setBusy(true)
    try {
      const res = await mint()
      if (res?.url && tab) tab.location.href = res.url
      else tab?.close()
    } catch (e) {
      tab?.close()
      notify.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" size="pill" className="self-start" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
      {t(`approvals.viewFile.${item.kind}`)}
    </Button>
  )
}
