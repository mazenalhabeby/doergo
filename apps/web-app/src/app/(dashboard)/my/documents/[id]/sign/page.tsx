"use client"

import { useCallback, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  FileText, Check, Loader2, ShieldCheck, ArrowLeft, ExternalLink,
} from "lucide-react"
import { documentsApi, type MemberDocumentRow, type DocumentTypeRow } from "@/lib/api"
import { SignaturePad } from "@/components/signature-pad"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  Signing, in a browser.

  The same three named steps as the phone — read, agree, sign — because the
  evidence trail records the same three acts either way, and a flow that
  differed by device would produce records that could not be compared.

  Consent is its own step and its own event: eIDAS treats agreement to the
  electronic form as distinct from the signature, and merging them would leave
  no way to show the signer was told what they were doing first.
*/

type Step = "read" | "agree" | "sign" | "done"

export default function SignDocumentPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>("read")
  const [hasRead, setHasRead] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /*
    One key for the life of this page, never regenerated.

    A key that changed on retry would defeat itself — the server would treat the
    retry as a new attempt and sign a second time.
  */
  const idempotencyKey = useMemo(
    () => `sign-${params.id}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    [params.id],
  )

  const { data: documents = [] } = useQuery<MemberDocumentRow[]>({
    queryKey: ["my-documents"],
    queryFn: () => documentsApi.list(),
  })
  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types"],
    queryFn: () => documentsApi.listTypes(),
  })

  const doc = documents.find((d) => d.id === params.id)
  const mode = types.find((ty) => ty.id === doc?.typeId)?.signatureMode ?? "IN_APP"
  const isAcknowledge = mode === "ACKNOWLEDGE"
  const totalSteps = isAcknowledge ? 2 : 3
  const stepNumber = step === "read" ? 1 : step === "agree" ? 2 : 3

  const openDocument = useCallback(async () => {
    setBusy(true)
    try {
      const res = await documentsApi.downloadUrl(String(params.id))
      if (!res?.url) throw new Error(t("documents.openFailed"))
      window.open(res.url, "_blank", "noopener,noreferrer")
      setHasRead(true)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("documents.openFailed"))
    } finally {
      setBusy(false)
    }
  }, [params.id, t])

  const agree = useCallback(async () => {
    setBusy(true)
    try {
      await documentsApi.consent(String(params.id))
      if (isAcknowledge) {
        await documentsApi.acknowledge(String(params.id))
        setStep("done")
        queryClient.invalidateQueries({ queryKey: ["my-documents"] })
      } else {
        setStep("sign")
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("documents.sign.failed"))
    } finally {
      setBusy(false)
    }
  }, [params.id, isAcknowledge, queryClient, t])

  const submit = useCallback(async () => {
    if (!signature) return
    setBusy(true)
    try {
      const res = await documentsApi.sign(String(params.id), {
        signatureImage: signature,
        idempotencyKey,
      })
      setStep("done")
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
      if (res?.alreadySigned) notify.success(t("documents.sign.alreadySigned"))
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("documents.sign.failed"))
    } finally {
      setBusy(false)
    }
  }, [params.id, signature, idempotencyKey, queryClient, t])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <button
        onClick={() => router.push("/my/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.my.title")}
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
              {doc?.title ?? t("documents.sign.title")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{doc?.typeLabel}</p>
          </div>
        </div>

        {step !== "done" && (
          <div className="mb-6">
            <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {t("documents.sign.stepOf", { step: stepNumber, total: totalSteps })}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 1 · Read ─────────────────────────────────────────────────── */}
        {step === "read" && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("documents.sign.readTitle")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("documents.sign.readBody")}
            </p>
            <Button onClick={openDocument} disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              {t("documents.sign.openDocument")}
            </Button>
            <Button variant="outline" onClick={() => setStep("agree")} disabled={!hasRead} className="w-full">
              {t("documents.sign.readIt")}
            </Button>
            {!hasRead && (
              <p className="text-center text-xs text-slate-400">{t("documents.sign.mustOpen")}</p>
            )}
          </div>
        )}

        {/* ── 2 · Agree ────────────────────────────────────────────────── */}
        {step === "agree" && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("documents.sign.agreeTitle")}
            </h2>

            <blockquote className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {t("documents.sign.consentText")}
            </blockquote>

            {/*
              Said plainly, before it happens.

              Somebody signing an employment contract is entitled to know what
              is being recorded about them, and a product that hid it would be
              doing the opposite of what an evidence trail is for.
            */}
            <div>
              <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
                {t("documents.sign.recordedNotice")}
              </p>
              <ul className="space-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                {["account", "device", "time", "hash"].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {t(`documents.sign.records.${k}`)}
                  </li>
                ))}
              </ul>
            </div>

            <Button onClick={agree} disabled={busy} className="w-full">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAcknowledge ? t("documents.sign.confirmRead") : t("documents.sign.agreeAndSign")}
            </Button>
          </div>
        )}

        {/* ── 3 · Sign ─────────────────────────────────────────────────── */}
        {step === "sign" && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("documents.sign.signTitleWeb")}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("documents.sign.signBodyWeb")}
            </p>

            <SignaturePad onChange={setSignature} disabled={busy} />

            <Button onClick={submit} disabled={!signature || busy} className="w-full">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? t("documents.sign.sealing") : t("documents.sign.finish")}
            </Button>
          </div>
        )}

        {/* ── Done ─────────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-4 py-4 text-center">
            <div className={cn(
              "mx-auto grid h-14 w-14 place-items-center rounded-full",
              "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
            )}>
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isAcknowledge ? t("documents.sign.acknowledged") : t("documents.sign.sealed")}
            </h2>
            <p className="mx-auto max-w-sm text-sm text-slate-600 dark:text-slate-400">
              {isAcknowledge ? t("documents.sign.acknowledgedBody") : t("documents.sign.sealedBody")}
            </p>
            <Button onClick={() => router.push("/my/documents")} className="w-full">
              {t("documents.sign.viewDocuments")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
