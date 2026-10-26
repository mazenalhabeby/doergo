"use client"

import { useTranslation } from "react-i18next"
import { MoreHorizontal, XCircle, Eye } from "lucide-react"

import { companyName } from "@/components/companies/company-select"
import type { Invoice } from "@/lib/api"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { daysOverdue, bandFor, isOutstanding } from "../../_lib/aging"
import { statusStyle, primaryStep, otherSteps, isDeletable, type LifecycleStep } from "../../_lib/lifecycle"
import { formatCurrency } from "../../_lib/list-format"
import { INVOICE_GRID } from "./invoice-list-head"

/** One invoice in the list — the whole row opens it; the next step sits at its end. */
export function InvoiceRow({
  inv,
  isAdmin,
  severalCompanies,
  step,
  stepPending,
  onOpen,
  onDelete,
}: {
  inv: Invoice
  isAdmin: boolean
  severalCompanies: boolean
  /** Take a step, asking first where the lifecycle says to. */
  step: (inv: Invoice, s: LifecycleStep) => void
  stepPending: boolean
  onOpen: (id: string) => void
  onDelete: (inv: Invoice) => void
}) {
  const { t } = useTranslation()

  const status = statusStyle(inv.status)
  const primary = primaryStep(inv.status)
  const others = otherSteps(inv.status)
  const late = isOutstanding(inv) ? daysOverdue(inv.dueDate) : null
  const lateBand = late !== null && late > 0 ? bandFor(late) : null

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale(), { month: "short", day: "numeric", timeZone: "UTC" })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(inv.id)}
      onKeyDown={(e) => {
        // ⚠️ A clickable div is unreachable without this. The
        // whole row is the target, so it has to behave like one.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(inv.id)
        }
      }}
      className={cn(
        INVOICE_GRID,
        "group relative min-h-16 cursor-pointer rounded-[14px] px-3.5 py-2.5 outline-none transition-colors",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/*
        A short bar in the age's own colour. The band is already
        on the screen twice — as a bar and as a pill — and this
        makes a late row findable while SCROLLING, which is how
        this list is actually read.
      */}
      {lateBand && (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-3.5 left-0 top-3.5 w-[3px] rounded-full",
            lateBand === "d1_30" ? "bg-shell-warn/60" : lateBand === "d31_60" ? "bg-shell-warn" : "bg-shell-crit",
          )}
        />
      )}

      {/*
        ⚠️ THE CLIENT LEADS. The number was first and in mono at
        100px, so "INV-DEMO-2026-0010" wrapped onto two lines in
        every row — and it is not what anybody scans by. It is a
        reference: needed when you have it, never searched for.
      */}
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-semibold text-foreground">{inv.clientName}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">
          <span className="font-shell-mono xl:hidden">{inv.invoiceNumber}</span>
          {severalCompanies && inv.legalEntity && (
            <span>
              <span className="xl:hidden"> · </span>
              {companyName(inv.legalEntity)}
            </span>
          )}
          {inv.clientEmail && <span className="opacity-70"> · {inv.clientEmail}</span>}
        </p>
      </div>

      <span className="hidden truncate font-shell-mono text-[13px] text-muted-foreground xl:block">
        {inv.invoiceNumber}
      </span>

      {/* The two dates together, since they are read together. */}
      <div className="hidden text-[12.5px] leading-tight text-muted-foreground md:block">
        <p className="tabular-nums">{t("invoices.issuedOn", { date: day(inv.issueDate) })}</p>
        <p className="tabular-nums">
          {inv.dueDate ? t("invoices.dueOn", { date: day(inv.dueDate) }) : t("invoices.create.onReceipt")}
        </p>
      </div>

      <span className="hidden md:block">
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
            status.bg,
            status.text,
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {t(`invoices.statuses.${(inv.status || "DRAFT").toLowerCase()}`)}
        </span>
      </span>

      {/*
        The due date alone does not say how late something is —
        the reader has to do the arithmetic for every row. The
        age decides whether this is a reminder or a phone call,
        so it is stated.
      */}
      <div className="text-right">
        <p className="text-[15px] font-semibold tabular-nums text-foreground">
          {formatCurrency(inv.total, inv.currency)}
        </p>
        {late !== null && late > 0 && (
          <p
            className={cn(
              "text-xs font-semibold tabular-nums",
              lateBand === "d1_30" || lateBand === "d31_60" ? "text-shell-warn" : "text-shell-crit",
            )}
          >
            {t("invoices.daysLate", { count: late })}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-1">
        {/* ⚠️ The next step, stated — the one action a row exists for must not be the hardest thing on it. */}
        {isAdmin && primary && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              step(inv, primary)
            }}
            disabled={stepPending}
            className="hidden h-8 rounded-full px-3.5 text-[13px] font-semibold lg:inline-flex"
          >
            {t(primary.labelKey)}
          </Button>
        )}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                aria-label={t("common.more", "More")}
                className={
                  "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors " +
                  "hover:bg-shell-chip hover:text-foreground"
                }
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onOpen(inv.id)}>
                <Eye className="mr-2 size-3.5" /> {t("invoices.actions.view")}
              </DropdownMenuItem>
              {/*
                ⚠️ The SAME lifecycle the invoice page reads.
                This row and that bar each had their own idea of
                what came next and already disagreed about where
                Cancel lived — and this one still offered
                DRAFT → SENT, which the server no longer allows.
              */}
              {primary && (
                <DropdownMenuItem onClick={() => step(inv, primary)}>
                  <primary.icon className="mr-2 size-3.5" /> {t(primary.labelKey)}
                </DropdownMenuItem>
              )}
              {others
                .filter((o) => !o.destructive)
                .map((o) => (
                  <DropdownMenuItem key={o.to} onClick={() => step(inv, o)}>
                    <o.icon className="mr-2 size-3.5" /> {t(o.labelKey)}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              {isDeletable(inv.status) && (
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(inv)}>
                  <XCircle className="mr-2 size-3.5" /> {t("common.delete")}
                </DropdownMenuItem>
              )}
              {others
                .filter((o) => o.destructive)
                .map((o) => (
                  <DropdownMenuItem key={o.to} className="text-destructive" onClick={() => step(inv, o)}>
                    <o.icon className="mr-2 size-3.5" /> {t(o.labelKey)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
