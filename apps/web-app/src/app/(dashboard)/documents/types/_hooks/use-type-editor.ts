"use client"

import { keys } from "@/lib/query-keys"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { documentsApi, type DocumentTypeRow } from "@/lib/api"
import { documentTypeKey, type StarterDocumentType } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { requirementPayload } from "../_lib/type-options"

/**
 * The type editor's form state and its save — seeded from the type being
 * edited, or from the starter it begins as.
 */
export function useTypeEditor({
  type, starter, existingKeys, onClose,
}: {
  type: DocumentTypeRow | null
  starter: StarterDocumentType | null
  existingKeys: Set<string>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isNew = !type

  const [label, setLabel] = useState(
    type?.label ??
      (starter?.key
        ? t(`documents.types.starters.${starter.key}.label`, { defaultValue: starter.label })
        : ""),
  )
  const [description, setDescription] = useState(
    type?.description ??
      (starter?.key
        ? t(`documents.types.starters.${starter.key}.description`, { defaultValue: starter.description })
        : ""),
  )
  const [direction, setDirection] = useState(type?.direction ?? starter?.direction ?? "ISSUED")
  const [cadence, setCadence] = useState(type?.cadence ?? starter?.cadence ?? "ONE_OFF")
  const [signatureMode, setSignatureMode] = useState(type?.signatureMode ?? starter?.signatureMode ?? "NONE")
  const [isCredential, setIsCredential] = useState(type?.isCredential ?? starter?.isCredential ?? false)
  const [hasExpiry, setHasExpiry] = useState(type?.hasExpiry ?? starter?.hasExpiry ?? false)
  const [gates, setGates] = useState<string[]>(type?.requiredForWorkflowIds ?? [])
  const [requiredFromAll, setRequiredFromAll] = useState(type?.requiredFromAll ?? false)
  const [requiredFromRoleIds, setRequiredFromRoleIds] = useState<string[]>(type?.requiredFromRoleIds ?? [])
  /*
    Who may SEE documents of this type — the mirror of "required from" above.

    Empty means no restriction, which is what every type is today; a type becomes
    restricted only when somebody names roles here.
  */
  const [visibleToRoleIds, setVisibleToRoleIds] = useState<string[]>(type?.visibleToRoleIds ?? [])
  const [twoSided, setTwoSided] = useState(type?.twoSided ?? starter?.twoSided ?? false)
  /*
    Sheets of paper rather than a card.

    ⚠️ Mutually exclusive with `twoSided` — the server refuses the pair on both
    create and update, so turning one on turns the other off HERE rather than
    letting somebody save a combination that will be rejected.
  */
  const [multiPage, setMultiPage] = useState(type?.multiPage ?? false)
  const [scanShape, setScanShape] = useState(type?.scanShape ?? starter?.scanShape ?? "CARD")
  /*
    The signing route: an ordered list of roles.

    Empty means one signature by the member, which is what every type did before
    routes existed — so an untouched type keeps behaving exactly as it did.
  */
  const [route, setRoute] = useState<string[]>(
    Array.isArray(type?.signerRoute)
      ? (type!.signerRoute as Array<{ role: string }>).map((s) => s.role)
      : [],
  )
  const [retentionMonths, setRetentionMonths] = useState<number | null>(
    type?.retentionMonths ?? starter?.retentionMonths ?? null,
  )

  // The key follows the label until the type exists; after that it is frozen,
  // because it is what every document already filed is identified through.
  const key = isNew ? documentTypeKey(starter?.key || label) : type!.key
  const keyTaken = isNew && !!key && existingKeys.has(key)

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return documentsApi.createType({
          key, label, description,
          cadence, direction, signatureMode,
          isCredential, hasExpiry,
          requiredForWorkflowIds: isCredential ? gates : [],
          ...requirementPayload(direction, requiredFromAll, requiredFromRoleIds),
          visibleToRoleIds,
          twoSided: direction !== "ISSUED" && twoSided && !multiPage,
          multiPage: direction !== "ISSUED" && multiPage,
          scanShape,
          retentionMonths,
          // Sent on create as well as on edit. It was missing here, so "Who
          // signs it" was collected on the form and then thrown away — the type
          // had to be reopened and saved again for the route to stick.
          signerRoute: route.length ? route.map((r) => ({ role: r })) : null,
        })
      }
      /*
        `cadence` and `direction` are NOT sent on an edit.

        The server refuses them, and for a good reason: changing either
        re-interprets every document already filed under the type. A MONTHLY
        type turned ONE_OFF orphans twelve rows a year from their period, and
        flipping direction would hand members a delete button for payslips.
      */
      return documentsApi.updateType(type!.id, {
        label, description, signatureMode,
        isCredential, hasExpiry,
        requiredForWorkflowIds: isCredential ? gates : [],
        ...requirementPayload(direction, requiredFromAll, requiredFromRoleIds),
        visibleToRoleIds,
        twoSided: direction !== "ISSUED" && twoSided && !multiPage,
        multiPage: direction !== "ISSUED" && multiPage,
        scanShape,
        retentionMonths,
        // null, not [] — the server reads null as "no route" and an empty array
        // as a type somebody misconfigured.
        signerRoute: route.length ? route.map((r) => ({ role: r })) : null,
      })
    },
    onSuccess: () => {
      notify.success(t(isNew ? "documents.types.created" : "documents.types.saved"))
      queryClient.invalidateQueries({ queryKey: keys.documents.types() })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const canSave = !!label.trim() && !!key && !keyTaken && !save.isPending

  return {
    isNew, key, keyTaken, save, canSave,
    label, setLabel, description, setDescription,
    direction, setDirection, cadence, setCadence,
    signatureMode, setSignatureMode,
    isCredential, setIsCredential, hasExpiry, setHasExpiry,
    gates, setGates,
    requiredFromAll, setRequiredFromAll, requiredFromRoleIds, setRequiredFromRoleIds,
    visibleToRoleIds, setVisibleToRoleIds,
    twoSided, setTwoSided, multiPage, setMultiPage, scanShape, setScanShape,
    route, setRoute, retentionMonths, setRetentionMonths,
  }
}
