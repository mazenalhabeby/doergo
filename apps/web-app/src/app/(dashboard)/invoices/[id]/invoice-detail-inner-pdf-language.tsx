"use client"

import { Download, Printer, Trash2, Pencil, Loader2, MoreHorizontal, Languages, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { documentLocaleOf } from "@/lib/invoice-document-locale"
import { CLIENT_LOCALE_OPTIONS, clientLocaleName } from "@/lib/client-locale"
import type { SupportedLocale } from "@hbcfield/shared/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InvoiceTopBar } from "../_components/invoice-shell"
import { isEditable, isDeletable } from "../_lib/lifecycle"
import type { InvoiceDetailInnerState } from "./use-invoice-detail-inner"
import type { InvoiceDetailInnerView } from "./invoice-detail-inner-view"
import type { InvoiceDetailInner } from "./page"

/** Part of InvoiceDetailInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function InvoiceDetailInnerPdfLanguage({
  vm,
  statusLabel,
  style,
  primary,
  step,
  others,
  id,
}: {
  vm: InvoiceDetailInnerState
  statusLabel: ReturnType<typeof InvoiceDetailInnerView>["statusLabel"]
  style: ReturnType<typeof InvoiceDetailInnerView>["style"]
  primary: ReturnType<typeof InvoiceDetailInnerView>["primary"]
  step: ReturnType<typeof InvoiceDetailInnerView>["step"]
  others: ReturnType<typeof InvoiceDetailInnerView>["others"]
  id: Parameters<typeof InvoiceDetailInner>[0]["id"]
}) {
  const {
    inv,
    router,
    busy,
    t,
    pdfLocaleOverride,
    setPdfLocaleOverride,
    print,
    download,
    isAdmin,
    setConfirmDelete,
    isLoading,
  } = vm
  if (isLoading) return null
  if (!inv) return null
  return (
    <InvoiceTopBar
      title={inv.invoiceNumber}
      subtitle={inv.clientName}
      status={{ label: statusLabel, className: cn(style.bg, style.text) }}
      onBack={() => router.push("/invoices")}
    >
      {/*
        Which language the client's PDF is written in. Defaults to the
        client's, and says whose it is and what that is — "Language: client's
        (Deutsch)" — because an office working in English would otherwise
        download a German invoice and think something broke.
      */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={busy}>
            <Languages className="size-3.5" />
            <span className="hidden md:inline">
              {t("invoices.pdfLanguage.button", {
                language: pdfLocaleOverride
                  ? clientLocaleName(pdfLocaleOverride)
                  : t("invoices.pdfLanguage.client", {
                      language: clientLocaleName(documentLocaleOf(inv.documentLocale)),
                    }),
              })}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("invoices.pdfLanguage.hint")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPdfLocaleOverride(null)}>
            <Check className={cn("mr-2 size-3.5", pdfLocaleOverride !== null && "invisible")} />
            {t("invoices.pdfLanguage.client", { language: clientLocaleName(documentLocaleOf(inv.documentLocale)) })}
          </DropdownMenuItem>
          {CLIENT_LOCALE_OPTIONS.map((o) => (
            <DropdownMenuItem key={o.value} onClick={() => setPdfLocaleOverride(o.value as SupportedLocale)}>
              <Check className={cn("mr-2 size-3.5", pdfLocaleOverride !== o.value && "invisible")} />
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={print}>
        <Printer className="size-3.5" />
        <span className="hidden sm:inline">{t("invoices.actions.print")}</span>
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={download}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        <span className="hidden sm:inline">{t("invoices.actions.pdf")}</span>
      </Button>

      {/*
        ⚠️ ONE primary action, and the lifecycle decides which. A draft is
        issued; an issued invoice is marked sent; a sent one is marked paid.
        Offering two at once asks somebody to work out which step this
        invoice is up to, which is the screen's job.
      */}
      {isAdmin && primary && (
        <Button size="sm" className="gap-1.5" onClick={() => step(primary)}>
          <primary.icon className="size-3.5" /> {t(primary.labelKey)}
        </Button>
      )}

      {/*
        ⚠️ Edit, cancel and delete used to float under the sheet in a bare row
        with no container — three ghost buttons adrift at the bottom of the
        page, two of them destructive and one of them red next to "Edit".
        They belong with the other actions, and behind one more click.
      */}
      {isAdmin && (others.length > 0 || isEditable(inv.status)) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8 shrink-0" aria-label={t("common.more", "More")}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isEditable(inv.status) && (
              <DropdownMenuItem onClick={() => router.push(`/invoices/${id}/edit`)}>
                <Pencil className="mr-2 size-3.5" /> {t("common.edit", "Edit")}
              </DropdownMenuItem>
            )}
            {others.map((o) => (
              <DropdownMenuItem key={o.to} className={cn(o.destructive && "text-red-600")} onClick={() => step(o)}>
                <o.icon className="mr-2 size-3.5" /> {t(o.labelKey)}
              </DropdownMenuItem>
            ))}
            {isDeletable(inv.status) && (
              <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-2 size-3.5" /> {t("common.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </InvoiceTopBar>
  )
}
