"use client"

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
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
function SectionHead({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className={
          "grid size-[26px] shrink-0 place-items-center rounded-full bg-shell-accent " +
          "text-[12.5px] font-bold tabular-nums text-shell-on-accent"
        }
      >
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{hint}</p>}
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
  /**
   * The state chip. Hidden below `sm`, where the title needs the room.
   *
   * ⚠️ The caller brings its own colour. A draft and an overdue invoice are the
   * same control and must not read the same: an amber chip on a document that
   * is four months late says "in progress", which is the opposite of true.
   */
  status?: { label: string; className?: string }
  /**
   * Where the arrow goes.
   *
   * ⚠️ NEVER `router.back()`. History is not a place: opened from a link, a
   * notification or a fresh tab there is nothing to go back TO and the arrow
   * does nothing at all; arrived at from the invoice you just saved, it walks
   * you into the draft you already committed. Every one of these screens is
   * ABOUT one invoice, and the place above them is the list.
   */
  onBack: () => void
  /** The actions. Right-aligned; the committing one goes last. */
  children?: ReactNode
}) {
  return (
    <div data-invoice-topbar className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className={cn(PAGE_WIDTH, "flex items-center gap-3 py-3")}>
        <Button variant="outline" size="pillIcon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.03em] text-foreground">
              {title}
            </h1>
            {status && (
              <span
                className={cn(
                  "hidden h-7 shrink-0 items-center gap-1.5 rounded-[9px] px-[11px] text-[13px] font-semibold sm:inline-flex",
                  status.className ?? "bg-shell-chip text-muted-foreground",
                )}
              >
                {status.label}
              </span>
            )}
          </div>
          {subtitle && <p className="truncate text-[13.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="flex-1" />
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
    <div className="bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn">
      <div className={cn(PAGE_WIDTH, "py-2.5 text-center text-[13px] font-semibold")}>{children}</div>
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
/** The nearest ancestor that scrolls — the dashboard's content pane, not the window. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === "auto" || o === "scroll") return p
  }
  return null
}

/**
 * Fit the rail to the space that is really there: below the top bar, down to
 * the bottom of the scrolling pane.
 *
 * ⚠️ MEASURED, NOT TYPED. The rail used to be `top: 53px; height: 100dvh - 53px`
 * — but the pane scrolls under the app's own navigation, and the top bar grew
 * past 53px. So the rail was taller than what could be seen, its last controls
 * sat below the screen, and the only way to reach them was to scroll the whole
 * page. A number typed here goes wrong the next time either bar changes.
 */
function useRailFit(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const scroller = scrollParent(el)
    const bar = document.querySelector<HTMLElement>("[data-invoice-topbar]")
    const fit = () => {
      const top = bar?.offsetHeight ?? 0
      const visible = scroller ? scroller.clientHeight : window.innerHeight
      el.style.setProperty("--rail-top", `${top}px`)
      el.style.setProperty("--rail-h", `${Math.max(240, visible - top)}px`)
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (bar) ro.observe(bar)
    if (scroller) ro.observe(scroller)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [ref])
}

/** The rail beside the document — wider on a wide screen, as the board draws its steps. */
const WORKBENCH_COLUMNS = "lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]"

export function InvoiceWorkbench({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  const railRef = useRef<HTMLElement>(null)
  useRailFit(railRef)
  return (
    <div className={cn(PAGE_WIDTH, "grid items-start gap-x-[18px]", WORKBENCH_COLUMNS)}>
      {/*
        On a wide screen the rail is its own scrolling column: it stays put
        while the document scrolls, and scrolling inside it never drags the
        page along (overscroll-contain). On a phone it is simply the top of
        the page.
      */}
      <aside
        ref={railRef}
        className={
          "py-5 lg:sticky lg:top-[var(--rail-top,53px)] lg:h-[var(--rail-h,calc(100dvh-53px))] " +
          "lg:overflow-y-auto lg:overscroll-contain [scrollbar-gutter:stable]"
        }
      >
        <div className="flex flex-col gap-2.5">{rail}</div>
      </aside>

      <main className="min-w-0 py-5">
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
    <div className="rounded-[20px] border border-border bg-card px-[18px] py-4 shadow-shell">
      <SectionHead step={step} title={title} hint={hint} />
      {children}
    </div>
  )
}
