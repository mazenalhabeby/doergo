"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  assetsApi,
  type AssetCategory,
  type AssetProposal,
  type ContractFields,
  type ContractPreview,
} from "@/lib/api"
import { normalizeKindShape, canManageAssetsIn } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { keys } from "@/lib/query-keys"

/** ReviewDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useReviewDialog({
  proposal, kinds, onClose,
}: Pick<{
  proposal: AssetProposal | null
  kinds: AssetCategory[]
  onClose: () => void
}, 'proposal' | 'kinds' | 'onClose'>) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()

  /*
    Only kinds a member can hold, in a workspace THIS reviewer manages. Accepting
    runs the contract flow, which refuses a kind outside their workspaces as not
    found — offering one would be a choice that can only fail. Same filter as
    the contract dialog; an org-wide manager keeps every kind.
  */
  const usable = kinds.filter((k) => {
    const shape = normalizeKindShape(k.config)
    return shape.holder.enabled && shape.holder.members && canManageAssetsIn(user, k.spaceId)
  })

  const [categoryId, setCategoryId] = useState("")
  const [fields, setFields] = useState<ContractFields>({})
  const [retire, setRetire] = useState(true)
  const [note, setNote] = useState("")
  const [refusing, setRefusing] = useState(false)

  // Keyed on the proposal so opening a second one starts clean rather than
  // carrying the first one's corrections onto somebody else's vehicle.
  const [seeded, setSeeded] = useState<string | null>(null)
  if (proposal && seeded !== proposal.id) {
    setSeeded(proposal.id)
    setCategoryId(proposal.categoryId ?? (usable.length === 1 ? usable[0]!.id : ""))
    setFields(proposal.fields ?? {})
    setRetire(true)
    setNote("")
    setRefusing(false)
  }

  const holderUserId = proposal?.holderUserId ?? proposal?.raisedById ?? ""

  const previewQ = useQuery({
    queryKey: keys.assets.proposalPreview(proposal?.id, categoryId, retire, JSON.stringify(fields)),
    queryFn: () => assetsApi.previewContract({ categoryId, holderUserId, fields, retireReplaced: retire }),
    enabled: !!proposal && !!categoryId && !!holderUserId,
  })
  const preview: ContractPreview | undefined = previewQ.data ?? undefined

  const done = () => {
    qc.invalidateQueries({ queryKey: keys.assets.proposalsPending() })
    qc.invalidateQueries({ queryKey: keys.assets.kinds() })
    onClose()
  }

  const accept = useMutation({
    mutationFn: () => assetsApi.acceptProposal(proposal!.id, { categoryId, fields, retireReplaced: retire }),
    onSuccess: () => { notify.success(t("proposals.accepted", "Added and handed over.")); done() },
    onError: (e: Error) => notify.error(e.message),
  })

  const reject = useMutation({
    mutationFn: () => assetsApi.rejectProposal(proposal!.id, note.trim() || undefined),
    onSuccess: () => { notify.success(t("proposals.refused", "Refused.")); done() },
    onError: (e: Error) => notify.error(e.message),
  })

  const openDocument = useMutation({
    mutationFn: () => assetsApi.getProposalDocumentUrl(proposal!.id),
    onSuccess: (d) => { if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer") },
    onError: (e: Error) => notify.error(e.message),
  })

  return {
    t,
    usable,
    categoryId,
    setCategoryId,
    fields,
    setFields,
    retire,
    setRetire,
    note,
    setNote,
    refusing,
    setRefusing,
    previewQ,
    preview,
    accept,
    reject,
    openDocument,
  }
}
