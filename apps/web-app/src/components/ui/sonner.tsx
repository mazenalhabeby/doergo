"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import i18n from "i18next"
import { Toaster as Sonner, toast } from "sonner"
import { Icon } from "@/components/ui/icon"

type ToasterProps = React.ComponentProps<typeof Sonner>

/*
  The toast (toast board, 2026-10-26): the design's pill at the bottom CENTRE. It lands with a spring out of a
  soft blur, its icon tells the story (the tick draws itself, an error shakes), and a thin line along the bottom
  shows the time left and stops while the pointer is on it. Jade; coral for an error, amber for a warning, ink
  for news and for work in progress (a page being scanned). Every colour and motion is CSS in globals.css
  (`.toast-*`, keyed on Sonner's `data-type`), so both themes and reduced motion follow.
  ⚠️ Sonner owns the toast's ::before/::after (hover gaps) and its transform (stacking) — the sheen is a
  background layer and the entry blur is `filter`, so neither fights it.
*/
const PILL =
  "toast-pill pointer-events-auto flex w-full items-center gap-3 overflow-hidden rounded-[28px] py-2 pl-2 pr-2.5 " +
  "font-shell min-h-[56px]"

/**
 * How long each kind stays — ONE table: it sets Sonner's `duration` AND the time-left line's `--toast-life`, so
 * the line always ends when the toast does (a caller's own `duration` moves both). Errors outlast good news.
 */
export const TOAST_LIFE_MS = { default: 4000, success: 4000, info: 5000, warning: 6000, error: 8000 } as const

type Kind = "success" | "info" | "warning" | "error"
type Data = Parameters<typeof toast.success>[1]
const lifeStyle = (ms: number, style?: React.CSSProperties) =>
  ({ ...style, "--toast-life": `${ms}ms` }) as React.CSSProperties

/*
  ⚠️ Sonner's own `toast.success/info/warning/error` are wrapped ONCE, here, so the 70 call sites need no change.
  The flag keeps a hot reload from wrapping a wrapper.
*/
for (const kind of ["success", "info", "warning", "error"] as Kind[]) {
  const original = toast[kind] as typeof toast.success & { lifed?: boolean }
  if (original.lifed) continue
  const lifed = ((message: Parameters<typeof toast.success>[0], data?: Data) => {
    const ms = typeof data?.duration === "number" ? data.duration : TOAST_LIFE_MS[kind]
    return original(message, { ...data, duration: ms, style: lifeStyle(ms, data?.style) })
  }) as typeof toast.success & { lifed?: boolean }
  lifed.lifed = true
  toast[kind] = lifed
}

const icon = (mark: React.ReactNode) => (
  <>
    <span className="toast-icon">{mark}</span>
    <span aria-hidden className="toast-life" />
  </>
)

/** Z undoes while a toast offers it; Esc closes the front one — never while typing. */
function useToastKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      /*
        Only when nothing else is listening: focus on the page itself or in the toast. Escape in a dialog, a menu
        or a popover is THEIRS (it closes them, never the Undo), and "z" in a menu or a select is typeahead.
      */
      const el = document.activeElement as HTMLElement | null
      const free = !el || el === document.body || !!el.closest("[data-sonner-toaster]")
      if (!free || document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]'))
        return
      const front = document.querySelector<HTMLElement>('[data-sonner-toast][data-front="true"]')
      if (!front) return
      if (e.key === "Escape") front.querySelector<HTMLElement>("[data-close-button]")?.click()
      if (e.key === "z" || e.key === "Z") {
        const action = front.querySelector<HTMLElement>("[data-button]")
        if (action && action.textContent?.trim() === i18n.t("common.undo", "Undo")) action.click()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  useToastKeys()

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-center"
      offset={28}
      gap={10}
      closeButton
      className="toaster group"
      icons={{
        success: icon(<Icon name="checkLine" size={22} />),
        info: icon(<Icon name="info" size={22} />),
        warning: icon(<Icon name="warning" size={22} />),
        error: icon(<Icon name="alert" size={22} />),
        loading: (
          <>
            <span className="toast-scan">
              <Icon name="file" size={26} />
            </span>
            <span aria-hidden className="toast-sweep" />
          </>
        ),
      }}
      duration={TOAST_LIFE_MS.default}
      style={lifeStyle(TOAST_LIFE_MS.default)}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: PILL,
          icon: "contents",
          content: "flex min-w-0 flex-1 flex-col py-1 pl-1",
          title: "text-[14.5px] font-semibold leading-snug",
          description: "toast-description text-[12.5px] font-medium leading-snug",
          actionButton: "toast-action h-[38px] shrink-0 rounded-full px-4 text-[13px] font-bold",
          cancelButton: "h-[38px] shrink-0 rounded-full px-3 text-[13px] font-semibold opacity-80 hover:opacity-100",
          closeButton: "toast-close",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
