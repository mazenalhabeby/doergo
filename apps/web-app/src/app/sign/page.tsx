"use client"

import { Suspense } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { SignaturePad } from "@/components/common/signature-pad"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSignLink } from "./_hooks/use-sign-link"
import { Shell, Refused } from "./_components/sign-shell"
import { Tabs, Row } from "./_components/sign-document-list"
import { EmptyNote } from "@/components/ui/empty-note"

function SignPageInner() {
  const {
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
  } = useSignLink()

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
    return (
      <Shell>
        <Refused refusal={state?.refusal ?? "unknown"} />
      </Shell>
    )
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
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setStep("list")
              void load()
            }}
          >
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
            <EmptyNote>{t("signLink.list.nothing", "Nothing is waiting for your signature.")}</EmptyNote>
          ) : (
            <div className="space-y-2">
              {state.toSign.map((d) => (
                <Row
                  key={d.signerId}
                  doc={d}
                  checked={picked.includes(d.signerId)}
                  onToggle={() =>
                    setPicked((p) => (p.includes(d.signerId) ? p.filter((x) => x !== d.signerId) : [...p, d.signerId]))
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
                {d.title}
                {d.forMember ? ` — ${d.forMember}` : ""}
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
              <span>
                {t("signLink.agree.consent", "I have read these documents and agree to sign them electronically.")}
              </span>
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
              {t(
                "signLink.agree.recorded",
                "The name you typed · your IP address and browser · the exact time · a " +
                  "fingerprint of each document, so any later change shows · and which of " +
                  "them you opened.",
              )}
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
            {t("signLink.draw.body", {
              count: chosen.length,
              defaultValue: "This signature is applied to {{count}} documents.",
            })}
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

export default function SignPage() {
  // useSearchParams forces a client boundary in the App Router, exactly as the
  // reset-password page does.
  return (
    <Suspense fallback={null}>
      <SignPageInner />
    </Suspense>
  )
}
