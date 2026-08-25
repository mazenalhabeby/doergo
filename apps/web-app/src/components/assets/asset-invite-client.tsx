"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Check, Copy, Loader2, Search, Smartphone } from "lucide-react"

import { customersApi, invitationsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Invite a client into the app, tied to THIS asset.
 *
 * The generalisation of inviting a resident to an apartment: the invitation
 * carries the asset, and accepting binds the new login to it, so the client
 * sees this one thing and the requests raised about it — whether it is a flat,
 * a machine they lease, or a vehicle they hire.
 */
export function AssetInviteClient({
  assetId, assetName, spaceId,
}: {
  assetId: string
  assetName: string
  spaceId?: string | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const clientsQ = useQuery({
    queryKey: ["space-clients", spaceId],
    queryFn: () => customersApi.list({ spaceId: spaceId ?? undefined, limit: 100 }),
    enabled: open,
  })
  const clients = (clientsQ.data?.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(q.trim().toLowerCase()),
  )

  const invite = useMutation({
    mutationFn: () =>
      invitationsApi.create({
        targetRole: "CUSTOMER",
        customerId: customerId!,
        assetId,
        // Emailed when given; otherwise the code is handed over in person.
        ...(email.trim() ? { email: email.trim() } : {}),
      }),
    onSuccess: (res: { code?: string } | undefined) => {
      setCode(res?.code ?? null)
      notify.success(t("assetInvite.sent", "Invitation created"))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) { setQ(""); setCustomerId(null); setEmail(""); setCode(null); setCopied(false) }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Smartphone className="mr-1.5 h-3.5 w-3.5" /> {t("assetInvite.invite", "Invite a client")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("assetInvite.title", "Invite a client")}</DialogTitle>
          <DialogDescription>
            {t("assetInvite.hint", "They sign in and see {{name}} and the requests raised about it.", { name: assetName })}
          </DialogDescription>
        </DialogHeader>

        {code ? (
          // Shown once. The code is what the client needs, and losing it means
          // issuing another — so it is put somewhere copyable, not in a toast.
          <div className="space-y-2 py-2">
            <Label className="text-xs text-muted-foreground">{t("assetInvite.code", "Their code")}</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-lg tracking-widest text-foreground">
                {code}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(code)
                  setCopied(true)
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {email.trim()
                ? t("assetInvite.alsoEmailed", "Also emailed to {{email}}.", { email: email.trim() })
                : t("assetInvite.handOver", "Hand this to them — it is not shown again.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-muted-foreground">{t("assetInvite.who", "Which client")}</Label>
              <div className="mt-1 rounded-xl border border-border">
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("common.search", "Search…")}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {clientsQ.isLoading ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">{t("common.loading", "Loading…")}</p>
                  ) : clients.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {t("assetRecords.noClients", "No clients in this workspace yet")}
                    </p>
                  ) : clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomerId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                        customerId === c.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {customerId === c.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                {t("assetInvite.email", "Email it to")}{" "}
                <span className="text-muted-foreground/60">{t("common.optional", "(optional)")}</span>
              </Label>
              <Input
                className="mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("assetInvite.emailPh", "name@example.com")}
                type="email"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {code ? t("common.done", "Done") : t("common.cancel", "Cancel")}
          </Button>
          {!code && (
            <Button disabled={!customerId || invite.isPending} onClick={() => invite.mutate()}>
              {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("assetInvite.create", "Create invitation")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
