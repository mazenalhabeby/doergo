"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { signLinkApi, type LinkDocumentRow, type LinkOpenResult } from "@/lib/api"
import { notify } from "@/lib/toast"

/*
  A client signing documents, with no account and no session.

  Outside `(dashboard)` on purpose: there is no sidebar, no organisation, no
  logged-in user, and nothing here may assume one. The only credential is a
  token that arrived in an email.

  The token stays in the QUERY STRING and is sent in POST bodies. It must never
  become a path segment: the gateway logs every request URL and the exception
  filter echoes it back in error bodies, so a token in the path would be written
  to stdout on every read. This mirrors reset-password, which made the same
  choice for the same reason.
*/

export type Step = "list" | "agree" | "draw" | "done"

/** SignPageInner's state and handlers — everything before its markup, moved here unchanged. */
export function useSignPageInner() {
  const { t } = useTranslation()
  const token = useSearchParams().get("token") ?? ""

  const [state, setState] = useState<LinkOpenResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>("list")
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signedCount, setSignedCount] = useState(0)

  /*
    One idempotency key for the whole ceremony, minted once.

    The server derives a per-document key from it, so a dropped connection
    replays the entire sitting safely — and a client who taps twice signs once.
  */
  const ceremonyKey = useMemo(
    () => `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    [],
  )

  const load = useCallback(async () => {
    if (!token) {
      setState({ ok: false, refusal: "unknown" })
      setLoading(false)
      return
    }
    try {
      const res = await signLinkApi.open(token)
      setState(res)
      if (res.ok) {
        // Everything waiting is selected to begin with: a client who was sent
        // eleven time sheets came here to sign eleven, and making them tick
        // each one is friction with no evidential value. Unticking is the
        // deliberate act, which is the right way round.
        setPicked(res.toSign.map((d) => d.signerId))
      }
    } catch {
      setState({ ok: false, refusal: "unknown" })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const openDocument = async (row: LinkDocumentRow) => {
    try {
      const res = await signLinkApi.file(token, row.signerId)
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer")
      // Reload so the "opened" mark is the server's answer, not a guess.
      void load()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
    }
  }

  const submit = async () => {
    if (!signature) return
    setBusy(true)
    try {
      const res = await signLinkApi.sign({
        token,
        signerIds: picked,
        signatureImage: signature,
        name,
        role: role || null,
        idempotencyKey: ceremonyKey,
      })
      setSignedCount(res?.signed ?? 0)
      setStep("done")
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  return {
    t,
    state,
    loading,
    step,
    setStep,
    picked,
    setPicked,
    name,
    setName,
    role,
    setRole,
    agreed,
    setAgreed,
    signature,
    setSignature,
    busy,
    signedCount,
    load,
    openDocument,
    submit,
  }
}
