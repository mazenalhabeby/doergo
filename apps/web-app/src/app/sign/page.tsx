"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { CheckCircle2, Clock, ExternalLink, FileText, Loader2, Mail, PenLine } from "lucide-react"

import { signLinkApi, type LinkDocumentRow, type LinkOpenResult } from "@/lib/api"
import { SignaturePad } from "@/components/signature-pad"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

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

type Step = "list" | "agree" | "draw" | "done"

function SignPageInner() {
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

  if (loading) {
    return (
      <Shell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    )
  }

  if (!state?.ok) {
    return <Shell><Refused refusal={state?.refusal ?? "unknown"} /></Shell>
  }

  if (step === "done") {
    return (
      <Shell org={state.organizationName}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="mt-3 text-xl font-semibold">{t("signLink.done.title", "Signed")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("signLink.done.body", {
              count: signedCount,
              defaultValue_one: "{{count}} document is now complete, with every signature on it.",
              defaultValue_other: "{{count}} documents are now complete, with every signature on them.",
              defaultValue: "{{count}} documents are now complete.",
            })}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("signLink.done.keep", "This link stays your way back to these documents.")}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => { setStep("list"); void load() }}>
            {t("signLink.done.back", "Back to my documents")}
          </Button>
        </div>
      </Shell>
    )
  }

  const chosen = state.toSign.filter((d) => picked.includes(d.signerId))

  return (
    <Shell org={state.organizationName} subtitle={state.customerName}>
      {step === "list" && (
        <>
          <Tabs toSign={state.toSign.length} signed={state.signed.length} />

          {state.toSign.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("signLink.list.nothing", "Nothing is waiting for your signature.")}
            </p>
          ) : (
            <div className="space-y-2">
              {state.toSign.map((d) => (
                <Row
                  key={d.signerId}
                  doc={d}
                  checked={picked.includes(d.signerId)}
                  onToggle={() =>
                    setPicked((p) =>
                      p.includes(d.signerId) ? p.filter((x) => x !== d.signerId) : [...p, d.signerId],
                    )
                  }
                  onOpen={() => openDocument(d)}
                />
              ))}
              <Button className="mt-3 w-full" disabled={picked.length === 0} onClick={() => setStep("agree")}>
                {t("signLink.list.signN", { count: picked.length, defaultValue: "Sign {{count}} selected" })}
              </Button>
            </div>
          )}

          {state.signed.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("signLink.list.signedHeading", "Already signed")}
              </h2>
              <div className="space-y-2">
                {state.signed.map((d) => (
                  <Row key={d.signerId} doc={d} onOpen={() => openDocument(d)} readOnly />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {step === "agree" && (
        <>
          <h1 className="mb-3 text-center text-lg font-semibold">
            {t("signLink.agree.title", { count: chosen.length, defaultValue: "You are signing {{count}} documents" })}
          </h1>

          <ul className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {chosen.map((d) => (
              <li key={d.signerId} className="truncate">
                {d.title}{d.forMember ? ` — ${d.forMember}` : ""}
              </li>
            ))}
          </ul>

          <div className="space-y-3">
            <div>
              <Label htmlFor="signer-name" className="text-xs">
                {t("signLink.agree.name", "Your full name")}
              </Label>
              <Input id="signer-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="signer-role" className="text-xs">
                {t("signLink.agree.role", "Your role (optional)")}
              </Label>
              <Input id="signer-role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <span>{t("signLink.agree.consent", "I have read these documents and agree to sign them electronically.")}</span>
            </label>

            {/*
              Said plainly, before they act rather than after.

              The name they type is the only identity this has, and the
              certificate will say exactly that. Somebody agreeing to sign is
              entitled to know what is being written down about them.
            */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">
                {t("signLink.agree.recordedTitle", "When you sign, this is recorded")}
              </p>
              {t("signLink.agree.recorded", "The name you typed · your IP address and browser · the exact time · a fingerprint of each document, so any later change shows · and which of them you opened.")}
            </div>

            <Button className="w-full" disabled={!agreed || name.trim().length < 2} onClick={() => setStep("draw")}>
              {t("signLink.agree.next", "Agree and sign")}
            </Button>
          </div>
        </>
      )}

      {step === "draw" && (
        <>
          <h1 className="mb-1 text-center text-lg font-semibold">
            {t("signLink.draw.title", "Sign with your finger or mouse")}
          </h1>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            {t("signLink.draw.body", { count: chosen.length, defaultValue: "This signature is applied to {{count}} documents." })}
          </p>
          <SignaturePad onChange={setSignature} disabled={busy} />
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("agree")} disabled={busy}>
              {t("common.back", "Back")}
            </Button>
            <Button className="flex-1" disabled={!signature || busy} onClick={submit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("signLink.draw.submit", { count: chosen.length, defaultValue: "Sign {{count}} documents" })}
            </Button>
          </div>
        </>
      )}
    </Shell>
  )
}

/** The page frame. Deliberately plain — a client has never seen this product. */
function Shell({ children, org, subtitle }: { children: React.ReactNode; org?: string; subtitle?: string }) {
  return (
    <main className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 text-center">
          <span className="text-lg font-bold tracking-tight text-primary">HBC FIELD</span>
          {org && <p className="mt-1 text-sm text-muted-foreground">{org}</p>}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">{children}</div>
      </div>
    </main>
  )
}

function Tabs({ toSign, signed }: { toSign: number; signed: number }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex gap-4 border-b border-border text-sm">
      <span className="border-b-2 border-primary pb-2 font-medium">
        {t("signLink.tabs.toSign", "To sign")} · {toSign}
      </span>
      <span className="pb-2 text-muted-foreground">
        {t("signLink.tabs.signed", "Signed")} · {signed}
      </span>
    </div>
  )
}

function Row({
  doc, checked, onToggle, onOpen, readOnly,
}: {
  doc: LinkDocumentRow
  checked?: boolean
  onToggle?: () => void
  onOpen: () => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-border p-3", checked && "border-primary/40 bg-primary/5")}>
      {!readOnly && <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.title}</p>
        {doc.forMember && <p className="truncate text-xs text-muted-foreground">{doc.forMember}</p>}
        {doc.alreadySigned.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {t("signLink.row.signedBy", "Signed by")}{" "}
            {doc.alreadySigned.map((s) => s.name).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-xs text-primary">
          <ExternalLink className="h-3 w-3" />
          {t("signLink.row.open", "Open")}
        </button>
        {!readOnly && (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px]",
            doc.openedAt ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                         : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400")}>
            {doc.openedAt ? t("signLink.row.read", "Read") : t("signLink.row.unread", "Not opened")}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A link that does not work.
 *
 * Expired earns an offer of a new one; unknown says nothing at all. They render
 * differently on purpose and the SERVER already decided which — a page that
 * guessed would be a way to find out whether an address is a client here.
 */
function Refused({ refusal }: { refusal: "unknown" | "expired" }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (refusal === "unknown") {
    return (
      <div className="text-center">
        <FileText className="mx-auto h-9 w-9 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">{t("signLink.invalid.title", "This link is not valid")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("signLink.invalid.body", "Check the address in the email, or ask the company that sent it for a new link.")}
        </p>
      </div>
    )
  }

  return (
    <div className="text-center">
      <Clock className="mx-auto h-9 w-9 text-amber-600" />
      <h1 className="mt-3 text-lg font-semibold">{t("signLink.expired.title", "This link has expired")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("signLink.expired.body", "Your documents are still here. Enter the address this was sent to and we will send a new link.")}
      </p>

      {sent ? (
        <p className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("signLink.expired.sent", "If that address has documents with us, a link is on its way.")}
        </p>
      ) : (
        <div className="mx-auto mt-5 max-w-xs space-y-2 text-left">
          <Label htmlFor="reissue-email" className="text-xs">{t("signLink.expired.email", "Your email address")}</Label>
          <Input id="reissue-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button
            className="w-full"
            disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true)
              // Always the same outcome on screen, whatever happened. The
              // response cannot vary with whether the address is known, or this
              // becomes a way to discover who works with whom.
              try { await signLinkApi.resend(email) } catch { /* say nothing */ }
              setSent(true)
              setBusy(false)
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            {t("signLink.expired.send", "Send me a new link")}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SignPage() {
  // useSearchParams forces a client boundary in the App Router, exactly as the
  // reset-password page does.
  return (
    <Suspense fallback={null}>
      <SignPageInner />
    </Suspense>
  )
}
