"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PAGE_WIDTH } from "@/components/ui/page-width"

/**
 * The shape of a screen that builds an invoice.
 *
 * ⚠️ THERE ARE TWO OF THEM, and they had nothing in common. New Invoice was
 * rebuilt into a workbench — a bar, a rail of settings, and the document itself
 * as the only lifted surface — while Edit Invoice stayed the stack of five
 * identical cards the new page had been rejected for, with native date inputs
 * and no sight of the document at all. The same person does both jobs, twenty
 * minutes apart, and the second one looks like a different product.
 *
 * Making them merely LOOK alike would last until the next change to one of
 * them. So the shell is one thing, and each screen fills it.
 *
 * ⚠️ BAND OUTSIDE, COLUMN INSIDE, in every piece here. A bar's border, ground
 * and blur reach both edges of the window — a divider stopping in mid-air looks
 * broken — while its contents line up with the navigation. Collapsing the two
 * is what put New Invoice's controls on the bezel of a wide monitor.
 */

/** The step number and title that head each rail section. */
export function SectionHead({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-none text-foreground">{title}</h2>
        {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/** The way out, what this is, and the way to commit. */
export function InvoiceTopBar({
  title,
  subtitle,
  status,
  onBack,
  children,
}: {
  title: string
  /** Who it is for, or the invoice number — whichever identifies this one. */
  subtitle?: string
  /** The state chip. Hidden below `sm`, where the title needs the room. */
  status?: string
  onBack: () => void
  /** The actions. Right-aligned; the committing one goes last. */
  children?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className={cn(PAGE_WIDTH, "flex items-center gap-3.5 py-2.5")}>
        <Button variant="outline" size="icon" className="size-[30px] shrink-0" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="flex-1" />
        {status && (
          <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 sm:inline">
            {status}
          </span>
        )}
        {children}
      </div>
    </div>
  )
}

/**
 * Why the committing action is off.
 *
 * ⚠️ SAYS WHY, rather than only greying the button. A disabled action with no
 * reason beside it is the commonest way a form wastes somebody's afternoon —
 * and on these screens the missing thing is usually one field in a rail they
 * have already scrolled past.
 */
export function InvoiceNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
      <div className={cn(PAGE_WIDTH, "py-2 text-center text-xs")}>{children}</div>
    </div>
  )
}

/**
 * The rail and the canvas.
 *
 * ⚠️ The settings stay put and the document never moves while somebody changes
 * them. The controls used to sit ABOVE the thing they change, which meant every
 * adjustment was made blind and checked by scrolling.
 *
 * ⚠️ The rail is a 320px CONTAINER, not a narrow viewport. Anything inside it
 * laid out with `sm:grid-cols-2` asks about the WINDOW and gets two columns in
 * a column that cannot hold them — which is how "Rate (per hour)" ended up on
 * three lines beside a currency box reading "EUF".
 */
export function InvoiceWorkbench({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(PAGE_WIDTH, "grid items-start lg:grid-cols-[320px_minmax(0,1fr)]")}>
      <aside className="border-b border-border bg-muted/30 px-4 py-5 lg:sticky lg:top-[53px] lg:h-[calc(100dvh-53px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="space-y-5 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-5">{rail}</div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[820px] space-y-5">{children}</div>
      </main>
    </div>
  )
}

/** One rail section: a card, a numbered head, and its controls. */
export function RailSection({
  step,
  title,
  hint,
  children,
}: {
  step: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <SectionHead step={step} title={title} hint={hint} />
      {children}
    </div>
  )
}
