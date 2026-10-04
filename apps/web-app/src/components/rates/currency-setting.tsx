"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"
import { COMMON_CURRENCIES, SUPPORTED_CURRENCIES } from "@hbcfield/shared/client"

import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * A currency, chosen — for the organization, a workspace or a client.
 *
 * ⚠️ A RATE IS A NUMBER WITHOUT A UNIT: the currency belongs to the place it is
 * set on. So switching the currency of a place that already has rates re-reads
 * every one of them (€85 becomes $85), and that is said BEFORE anything is saved.
 * Invoices keep their own currency and are untouched.
 */

/** "US dollar" in the reader's language — the code stays beside it, so a missing name never hides which one it is. */
export function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code
  } catch {
    return code
  }
}

/** The local symbol ("$", "£", "CHF") — for the option label only. */
function currencySymbol(code: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")
    return part?.value ?? code
  } catch {
    return code
  }
}

/** "US dollar (USD, $)", or "Swiss franc (CHF)" when the symbol is the code. */
export function currencyLabel(code: string, locale: string): string {
  const sym = currencySymbol(code, locale)
  return sym && sym !== code ? `${currencyName(code, locale)} (${code}, ${sym})` : `${currencyName(code, locale)} (${code})`
}

const INHERIT = "__inherit__"

/**
 * The list itself. `inheritFrom` offers "Same as the organization (EUR)" first,
 * and choosing it is `null` — the place then follows the organization.
 */
export function CurrencySelect({
  id,
  value,
  onChange,
  inheritFrom,
  inheritLabel,
  disabled,
  className,
}: {
  id?: string
  value: string | null
  onChange: (code: string | null) => void
  inheritFrom?: string
  /** Defaults to "Same as the organization (EUR)". */
  inheritLabel?: string
  disabled?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const others = useMemo(
    () => SUPPORTED_CURRENCIES.filter((c) => !(COMMON_CURRENCIES as readonly string[]).includes(c))
      .slice()
      .sort((a, b) => currencyName(a, i18n.language).localeCompare(currencyName(b, i18n.language), i18n.language)),
    [i18n.language],
  )
  return (
    <Select
      value={value ?? (inheritFrom ? INHERIT : undefined)}
      onValueChange={(v) => onChange(v === INHERIT ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("h-10 rounded-xl", className)}>
        <SelectValue placeholder={t("currency.choose")} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {inheritFrom && (
          <>
            <SelectItem value={INHERIT}>{inheritLabel ?? t("currency.sameAsOrganization", { code: inheritFrom })}</SelectItem>
            <SelectSeparator />
          </>
        )}
        <SelectGroup>
          {COMMON_CURRENCIES.map((c) => (
            <SelectItem key={c} value={c}>{currencyLabel(c, i18n.language)}</SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className="text-xs text-muted-foreground">{t("currency.more")}</SelectLabel>
          {others.map((c) => (
            <SelectItem key={c} value={c}>{currencyLabel(c, i18n.language)}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * A currency as a setting: what it is now, and a Change button that asks before
 * it re-reads the rates set here.
 */
export function CurrencySetting({
  id,
  label,
  hint,
  value,
  inheritFrom,
  ratesSet = 0,
  onSave,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  /** The stored value — null follows `inheritFrom`. */
  value: string | null
  inheritFrom?: string
  /** How many rates set here would be re-read by a switch. */
  ratesSet?: number
  onSave: (code: string | null) => Promise<unknown>
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState<string | null>(value)
  const effective = value ?? inheritFrom ?? "EUR"
  const nextEffective = next ?? inheritFrom ?? "EUR"
  const changes = nextEffective !== effective

  const save = useMutation({
    mutationFn: () => onSave(next),
    onSuccess: () => {
      notify.success(t("currency.saved"))
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <span id={id} className="text-sm font-semibold">
          {currencyLabel(effective, i18n.language)}
          {value == null && inheritFrom && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t("currency.followsOrganization")}</span>
          )}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          disabled={disabled}
          onClick={() => { setNext(value); setOpen(true) }}
        >
          {t("rates.change")}
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("currency.changeTitle", { name: label })}</DialogTitle>
            <DialogDescription>{t("currency.changeDescription")}</DialogDescription>
          </DialogHeader>
          <CurrencySelect id={`${id}-select`} value={next} onChange={setNext} inheritFrom={inheritFrom} />
          {changes && (
            <ul className="space-y-1.5 text-sm">
              <li className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
                {t("currency.invoicesKeep")}
              </li>
              {ratesSet > 0 && (
                <li className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {t("currency.ratesReread", { count: ratesSet, from: effective, to: nextEffective })}
                </li>
              )}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || next === value} className="gap-1.5">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("currency.switchTo", { code: nextEffective })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
