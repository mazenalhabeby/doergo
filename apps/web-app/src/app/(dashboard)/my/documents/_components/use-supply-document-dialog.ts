"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { documentTitleFromText, expiryPrompt, expiryReady, suggestExpiry } from "@hbcfield/shared/client"
import { documentsApi, uploadToS3, type DocumentTypeRow } from "@/lib/api"
import { notify } from "@/lib/toast"
import { keys } from "@/lib/query-keys"

const MAX_BYTES = 20 * 1024 * 1024

/** SupplyDocumentDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useSupplyDocumentDialog({
  types,
  open,
  onClose,
}: Pick<{
  types: DocumentTypeRow[]
  open: boolean
  onClose: () => void
}, 'types' | 'open' | 'onClose'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const suppliable = useMemo(
    () => types.filter((ty) => ty.direction !== "ISSUED" && ty.isActive),
    [types],
  )

  const [typeId, setTypeId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [expiresOn, setExpiresOn] = useState("")
  const [docTitle, setDocTitle] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  /*
    Where the date came from.

    The web dialog was doing what the phone used to: demand a typed expiry, send
    the document, and let the server quietly overrule it with whatever it read.
    Busywork followed by a silent override — and the fix belongs on both
    surfaces, or a member gets a different product depending on where they open
    it.
  */
  const [staged, setStaged] = useState<string | null>(null)
  const [dateSource, setDateSource] = useState<"MRZ" | "TEXT" | "NOTHING" | null>(null)
  const [reading, setReading] = useState(false)
  /*
    The member has asked to set the date themselves.

    Being certain is not the same as being right — a licence photographed at an
    angle produces a confident wrong answer — so the correction is always one
    click away. It is never entered automatically: an app that quietly reopens
    the field it just filled in has not saved anybody anything.
  */
  const [overriding, setOverriding] = useState(false)

  /*
    DERIVED, not initialised from state.

    `useState(suppliable[0]?.id)` ran on the first render, when the types had
    not arrived yet, so the id stayed "". The select then displayed the first
    option — browsers show option one when `value` matches nothing — while the
    component believed no type was chosen: the form looked filled in and Send
    stayed disabled, with nothing on screen to explain why.
  */
  const type = suppliable.find((ty) => ty.id === typeId) ?? suppliable[0]

  /**
   * Upload it and ask what is on it, before anything is filed.
   *
   * The upload has to happen either way, so doing it while the dialog is still
   * open costs nothing and fills the date in for them.
   */
  const chooseFile = async (picked: File | null) => {
    setFile(picked)
    setStaged(null)
    setDateSource(null)
    setExpiresOn("")
    setOverriding(false)
    if (!picked || !type) return
    if (picked.size > MAX_BYTES) {
      notify.error(t("documents.supply.tooLarge"))
      setFile(null)
      return
    }

    setReading(true)
    try {
      /*
        A PDF is read HERE, and it is the only way it can be read at all.

        ⚠️ The server's OCR refuses anything that is not an image — rasterising
        a PDF needs a renderer auth-service does not have — so every certificate
        that arrives as a PDF, which is most of the ones that arrive by email,
        came back "nothing readable" and the member typed the date off a file
        they were looking at.

        The product could already do this. `extractPdfText` has been reading
        dropped PDFs on the office's batch screen for months; it just lived one
        directory out of reach of this dialog. And the text LAYER beats OCR
        outright — it is the characters the document was written with, not a
        guess at their shape — so where a PDF has one, this is the best reading
        available anywhere in the product.

        The file is already in the browser, so it costs no upload and answers
        before the upload the member is sending anyway has finished.
      */
      if (picked.type === "application/pdf") {
        // pdf.js is ~1MB — fetched the first time somebody actually hands over
        // a PDF, never as a tax on opening the dialog.
        const { extractPdfText } = await import("@/lib/pdf-text")
        const text = await extractPdfText(picked).catch(() => "")
        // The same rule the server runs on an image and the phone runs on a
        // photograph. One set of rules, three places they can run.
        const found = text ? suggestExpiry(text) : null
        // Its name, from its own heading — "Insurance Confirmation Letter", not "scan_0042".
        setDocTitle(text ? documentTitleFromText(text) : null)
        if (found) {
          setDateSource("TEXT")
          setExpiresOn(found.iso)
        }
      }

      const presigned = await documentsApi.ownUploadUrl({
        typeId: type.id,
        mimeType: picked.type || "application/pdf",
        sizeBytes: picked.size,
      })
      if (!presigned) throw new Error(t("documents.supply.failed"))
      await uploadToS3(presigned.url, picked, setProgress)
      setStaged(presigned.key)

      const read = await documentsApi.readOwnUpload(presigned.key)
      /*
        The server's answer wins where it HAS one — a zone expiry carries a
        check digit and a text layer does not. Where it found nothing, what was
        read here is kept rather than wiped back to "nothing readable": losing a
        date already on screen because a second, weaker reader missed it would
        be the worst of both.
      */
      if (read?.expiresOn) {
        setDateSource(read.source ?? "TEXT")
        setExpiresOn(read.expiresOn)
      } else {
        setDateSource((prev) => (prev === "TEXT" ? prev : read?.source ?? "NOTHING"))
      }
    } catch {
      // A failed read is not a failed upload: they can still type the date.
      // ⚠️ Only when nothing was read here either — an upload can fail long
      // after a perfectly good text-layer read.
      setDateSource((prev) => (prev === "TEXT" ? prev : "NOTHING"))
    } finally {
      setReading(false)
      setProgress(0)
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!file || !type) throw new Error(t("documents.supply.pickFile"))
      if (file.size > MAX_BYTES) throw new Error(t("documents.supply.tooLarge"))

      // Already uploaded while they were confirming the date.
      let key = staged
      if (!key) {
        const presigned = await documentsApi.ownUploadUrl({
          typeId: type.id,
          mimeType: file.type || "application/pdf",
          sizeBytes: file.size,
        })
        if (!presigned) throw new Error(t("documents.supply.failed"))
        await uploadToS3(presigned.url, file, setProgress)
        key = presigned.key
      }

      return documentsApi.submitOwn({
        stagingKey: key,
        typeId: type.id,
        title: docTitle ?? file.name.replace(/\.[^.]+$/, ""),
        expiresOn: type.hasExpiry ? expiresOn : undefined,
      })
    },
    onSuccess: () => {
      notify.success(t("documents.supply.submitted"))
      queryClient.invalidateQueries({ queryKey: keys.documents.mine() })
      reset()
      onClose()
    },
    onError: (e: Error) => {
      setProgress(0)
      notify.error(e.message)
    },
  })

  const reset = () => {
    setFile(null)
    setExpiresOn("")
    setStaged(null)
    setDateSource(null)
    setOverriding(false)
    setProgress(0)
  }

  /*
    One rule, shared with the phone.

    Both surfaces had the reading wired and both still LED with the picker: the
    block rendered the moment a type was chosen, before any file existed, so the
    first thing on screen was an empty date field for a date printed on the
    document about to be uploaded. Pre-filling it afterwards does not undo
    that — by then somebody has typed it.
  */
  const prompt = expiryPrompt({
    hasExpiry: !!type?.hasExpiry,
    hasFile: !!file,
    reading,
    source: dateSource,
    value: expiresOn || null,
    overriding,
  })
  const canSubmit = !!file && !!type && expiryReady(prompt) && !submit.isPending

  return {
    t,
    inputRef,
    suppliable,
    setTypeId,
    file,
    expiresOn,
    setExpiresOn,
    progress,
    setOverriding,
    type,
    chooseFile,
    submit,
    prompt,
    canSubmit,
  }
}
