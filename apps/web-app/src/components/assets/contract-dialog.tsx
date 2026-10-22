"use client"

import { useTranslation } from "react-i18next"
import { FileText } from "lucide-react"
import { type AssetCategory } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useContractDialog } from "./use-contract-dialog"
import { ContractPasteStep } from "./contract-paste-step"
import { ContractFieldsStep } from "./contract-fields-step"
import { ContractConfirmStep } from "./contract-confirm-step"

export function ContractDialog({
  kinds,
  spaceId,
  trigger,
  onCreated,
}: {
  /** The workspace's kinds. Only those whose records are held by a member. */
  kinds: AssetCategory[]
  /** The workspace this is opened from — whose roster a space-scoped manager picks from. */
  spaceId?: string
  trigger: React.ReactNode
  onCreated: (assetId: string) => void
}) {
  const {
    open,
    stage,
    setStage,
    text,
    setText,
    fields,
    setFields,
    categoryId,
    setCategoryId,
    holderUserId,
    setHolderUserId,
    retire,
    setRetire,
    preview,
    usable,
    kind,
    shape,
    members,
    read,
    ask,
    apply,
    reset,
    confidence,
    named,
    ready,
  } = useContractDialog({ kinds, spaceId, onCreated })
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {t("contract.title", "From a contract")}
          </DialogTitle>
        </DialogHeader>

        {/* ── 1. The text ─────────────────────────────────────────────────── */}
        {stage === "paste" && (
          <ContractPasteStep
            text={text}
            setText={setText}
            reading={read.isPending}
            onRead={() => read.mutate()}
            onSkip={() => setStage("fields")}
          />
        )}

        {/* ── 2. What it made of it ───────────────────────────────────────── */}
        {stage === "fields" && (
          <ContractFieldsStep
            usable={usable}
            categoryId={categoryId}
            setCategoryId={setCategoryId}
            shape={shape}
            members={members}
            holderUserId={holderUserId}
            setHolderUserId={setHolderUserId}
            fields={fields}
            setFields={setFields}
            confidence={confidence}
            named={named}
            retire={retire}
            setRetire={setRetire}
            ready={ready}
            asking={ask.isPending}
            onAsk={() => ask.mutate()}
            onBack={() => setStage("paste")}
          />
        )}

        {/* ── 3. The consequences ─────────────────────────────────────────── */}
        {stage === "confirm" && preview && (
          <ContractConfirmStep
            preview={preview}
            kind={kind}
            members={members}
            holderUserId={holderUserId}
            applying={apply.isPending}
            onApply={() => apply.mutate()}
            onBack={() => setStage("fields")}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
