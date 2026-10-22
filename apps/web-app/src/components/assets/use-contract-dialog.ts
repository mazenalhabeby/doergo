"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import {
  assetsApi,
  type AssetCategory,
  type ContractFields,
  type ContractPreview,
  type ContractReading,
} from "@/lib/api"
import { normalizeKindShape, assetManageSpaces, canManageAssetsIn } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { useAssignableMembers } from "@/hooks/use-assignable-members"

/**
 * A contract in, a record out — with the two things people forget done for them.
 *
 * The four screens this replaces: create the vehicle, type its plate and model,
 * assign it, then find the old one and retire it. The last two are the ones
 * that get skipped, and skipping them is not tidy-up debt — it means every fuel
 * receipt from that day lands against the car nobody is driving.
 *
 * ⚠️ IT PROPOSES. Three stages, and the middle one exists so nothing is ever
 * created from a reading nobody looked at:
 *
 *   1. Paste the text.       The reader fills the boxes.
 *   2. Correct the boxes.    Green was read, amber was guessed.
 *   3. Read the consequences, then confirm.
 *
 * ⚠️ And the consequences are the SERVER'S. This screen renders what
 * `/contracts/preview` returned and posts back the same reading — it never
 * says "retire asset a-456", because a client that could name the record to
 * retire could retire any record.
 */

type Stage = "paste" | "fields" | "confirm"

const FIELD_KEYS = ["registration", "vin", "manufacturer", "model", "startsOn", "endsOn"] as const

export type ContractFieldKey = (typeof FIELD_KEYS)[number]

/** Blank strings must not reach the server as empty values it then stores. */
function clean(fields: ContractFields): ContractFields {
  const out: ContractFields = {}
  for (const [k, v] of Object.entries(fields)) {
    const trimmed = typeof v === "string" ? v.trim() : v
    if (trimmed) (out as Record<string, string>)[k] = trimmed as string
  }
  return out
}

/** The contract reader's state: the three stages, the reading, who it may go to, and the three calls. */
export function useContractDialog({
  kinds,
  spaceId,
  onCreated,
}: {
  /** The workspace's kinds. Only those whose records are held by a member. */
  kinds: AssetCategory[]
  /** The workspace this is opened from — whose roster a space-scoped manager picks from. */
  spaceId?: string
  onCreated: (assetId: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>("paste")

  const [text, setText] = useState("")
  const [reading, setReading] = useState<ContractReading | null>(null)
  const [fields, setFields] = useState<ContractFields>({})
  const [categoryId, setCategoryId] = useState("")
  const [holderUserId, setHolderUserId] = useState("")
  const [retire, setRetire] = useState(true)
  const [preview, setPreview] = useState<ContractPreview | null>(null)

  /*
    Only kinds whose records are HELD BY A MEMBER. A contract hands something to
    somebody; a kind with no holder has nobody to hand it to, and offering it
    would produce a refusal three clicks later with no way to act on it.
  */
  const { user } = useAuth()
  /*
    ⚠️ And only kinds in a workspace the caller manages assets in.

    A Space Manager's `canManageAssets` reaches their own depot's kinds; the
    server answers any other as not found. Offering one here would be a
    refusal at the preview, with nothing on screen to say why.
  */
  const usable = kinds.filter((k) => {
    const shape = normalizeKindShape(k.config)
    return shape.holder.enabled && shape.holder.members && canManageAssetsIn(user, k.spaceId)
  })
  const kind = usable.find((k) => k.id === categoryId)
  const shape = normalizeKindShape(kind?.config)

  /*
    Who it can be handed to.

    The organization's member list is `canManageUsers` — a permission a Space
    Manager does not hold — so for them it came back refused and the picker was
    empty on the one screen they can now use. A space-scoped manager picks from
    THIS workspace's roster, which is also the honest list: they run this depot,
    not the company. An org-wide manager keeps the whole organization.
  */
  //
  // ⚠️ "Org-wide asset manager" is not "may read the member directory" — that is
  // canManageUsers. The shared hook asks the directory only of who may read it
  // and this workspace's roster otherwise (lib/assignable-members.ts).
  // A space-scoped asset manager runs this depot, not the company: its roster.
  const orgWide = assetManageSpaces(user) === null
  const { members: people } = useAssignableMembers({ spaceId, enabled: open, rosterOnly: !orgWide })
  const members = people.filter((m) => m.isActive !== false && m.role !== "CUSTOMER" && !m.isExternal)

  const read = useMutation({
    mutationFn: () => assetsApi.readContract(text),
    onSuccess: (r) => {
      if (!r) return
      setReading(r)
      setFields({
        registration: r.registration?.value ?? "",
        vin: r.vin?.value ?? "",
        manufacturer: r.manufacturer?.value ?? "",
        model: r.model?.value ?? "",
        startsOn: r.startsOn?.value ?? "",
        endsOn: r.endsOn?.value ?? "",
      })
      setStage("fields")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const ask = useMutation({
    mutationFn: () =>
      assetsApi.previewContract({ categoryId, holderUserId, fields: clean(fields), retireReplaced: retire }),
    onSuccess: (p) => {
      if (p) {
        setPreview(p)
        setStage("confirm")
      }
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const apply = useMutation({
    mutationFn: () =>
      assetsApi.applyContract({ categoryId, holderUserId, fields: clean(fields), retireReplaced: retire }),
    onSuccess: (r) => {
      if (!r) return
      notify.success(t("contract.created", "{{name}} is on the books and handed over.", { name: r.name }))
      reset(false)
      onCreated(r.assetId)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      setStage("paste")
      setText("")
      setReading(null)
      setFields({})
      setCategoryId(usable[0]?.id ?? "")
      setHolderUserId("")
      setRetire(true)
      setPreview(null)
    }
    setOpen(next)
  }

  const confidence = (key: ContractFieldKey): "certain" | "likely" | undefined =>
    (reading?.[key] as { confidence?: "certain" | "likely" } | undefined)?.confidence

  const named = !!(
    fields.name?.trim() ||
    fields.registration?.trim() ||
    fields.vin?.trim() ||
    (fields.manufacturer?.trim() && fields.model?.trim())
  )
  const ready = !!categoryId && !!holderUserId && named

  return {
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
  }
}

/** Somebody a contract can hand the thing to. */
export type ContractMember = ReturnType<typeof useContractDialog>["members"][number]
