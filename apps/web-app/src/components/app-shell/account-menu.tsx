"use client"

import Link from "next/link"
import { useState } from "react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
import { ChevronRight, ChevronsUpDown } from "lucide-react"
import { personName } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useMySections } from "@/hooks/use-my-sections"
import { supportedLanguages } from "@/i18n/languages"
import { useTour, useTourTarget } from "@/components/tour"
import { UserAvatar } from "@/components/common/user-avatar"
import { usePresence, PRESENCE_OPTS, type Presence } from "@/components/attendance/presence-toggle"
import { openSupport } from "@/components/support/support-opener"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LanguagePanel } from "./language-panel"

/** The ring around the avatar says the availability (design: live green · coral · grey). */
const RING: Record<Presence, string> = {
  AVAILABLE: "var(--shell-live)",
  BUSY: "var(--shell-crit)",
  AWAY: "var(--shell-soft)",
}
const ringStyle = (p: Presence, width: number) => ({
  boxShadow: `0 0 0 2px var(--shell-card), 0 0 0 ${width}px ${RING[p] ?? RING.AVAILABLE}`,
})

const ROW =
  "flex h-10 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-sm text-shell-ink outline-none " +
  "transition-colors hover:bg-shell-hover focus-visible:ring-2 focus-visible:ring-shell-accent"
const DIVIDER = <div aria-hidden className="mx-1.5 my-0.5 h-px bg-shell-line" />

/**
 * The account button at the foot of the sidebar and its menu (Home-Sidebar board): who I am, my status, my
 * things, the look and the language, help, sign out. Every row is a link or an action that already existed —
 * presence (usePresence), the tour (useTour), support (support-opener), the language (changeLanguage).
 */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const { settingsSections } = useRouteAccess()
  const mySections = useMySections()
  const { current: presence, set: setPresence, saving } = usePresence()
  const { resolvedTheme, setTheme } = useTheme()
  const { start } = useTour()
  const tour = useTourTarget()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<"menu" | "language">("menu")
  if (!user) return null

  const fullName = personName(user)
  const position = (user as { position?: string | null }).position || ""
  const orgName = (user as { organizationName?: string | null }).organizationName || ""
  const dark = resolvedTheme === "dark"
  const orgSection = settingsSections.find((s) => !["profile", "security", "my-emails", "clock-in"].includes(s))
  const close = () => setOpen(false)

  const links = [
    {
      href: "/settings?section=profile",
      label: t("account.myAccount", "My account"),
      hint: t("account.myAccountHint", "name, password, devices"),
      show: true,
    },
    {
      href: mySections[0]?.href ?? "",
      label: t("account.myThings", "My time, leave and documents"),
      hint: "",
      show: mySections.length > 0,
    },
    {
      href: `/settings?section=${orgSection}`,
      label: t("account.orgSettings", "Organization settings"),
      hint: "",
      show: !!orgSection,
    },
    { href: "/settings/billing", label: t("nav.userMenu.billing", "Billing"), hint: "", show: user.canManageUsers },
  ].filter((l) => l.show)

  const avatar = (size: "md" | "lg") => (
    <UserAvatar
      soft
      seed={user.id}
      firstName={user.firstName}
      lastName={user.lastName}
      avatarUrl={user.avatarUrl}
      size={size}
      className="shrink-0"
    />
  )

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setPanel("menu")
      }}
    >
      <PopoverTrigger
        data-tour="nav-profile"
        aria-label={t("account.button", { name: fullName, defaultValue: "{{name}} — account" })}
        className={cn(
          "flex h-[52px] w-full min-w-0 items-center gap-2.5 rounded-[14px] pl-[9px] pr-2 text-left text-shell-ink outline-none",
          "transition-colors hover:bg-shell-hover focus-visible:ring-2 focus-visible:ring-shell-accent",
          compact && "justify-center px-0",
        )}
      >
        <span className="rounded-full" style={ringStyle(presence, 3.5)}>
          {avatar("md")}
        </span>
        {!compact && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="truncate text-[13.5px]">{fullName}</b>
              <span className="truncate text-xs text-shell-soft">{position || user.email}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-[15px] shrink-0 text-shell-soft" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={compact ? "right" : "top"}
        align="start"
        sideOffset={10}
        aria-label={t("account.menu", "Your account")}
        className="w-[300px] rounded-[20px] border-shell-line bg-shell-card p-2 text-shell-ink shadow-[var(--shell-pop-shadow)]"
      >
        {panel === "language" ? (
          <LanguagePanel onBack={() => setPanel("menu")} />
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-3 px-2.5 pb-3 pt-2.5">
              <span className="rounded-full" style={ringStyle(presence, 4)}>
                {avatar("lg")}
              </span>
              <span className="flex min-w-0 flex-col leading-snug">
                <b className="truncate text-[14.5px]">{fullName}</b>
                <span className="truncate text-[12.5px] text-shell-soft">{user.email}</span>
                {(position || orgName) && (
                  <span className="truncate text-xs text-shell-soft">
                    {[position, orgName].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </div>
            <div role="radiogroup" aria-label={t("presence.title", "Availability")} className="flex gap-1 px-1.5 pb-2">
              {PRESENCE_OPTS.map((o) => {
                const on = presence === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={saving}
                    onClick={() => setPresence(o.value)}
                    className={cn(
                      "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] font-semibold",
                      "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-shell-accent disabled:opacity-60",
                      on ? "border-shell-ink bg-shell-hover" : "border-shell-line hover:bg-shell-hover",
                    )}
                  >
                    <i aria-hidden className="size-2 rounded-full" style={{ background: RING[o.value] }} />
                    {t(o.key, o.def)}
                  </button>
                )
              })}
            </div>
            {DIVIDER}
            {links.map((l) => (
              <Link key={l.label} href={l.href} prefetch={false} onClick={close} className={ROW}>
                <span className="flex-1">{l.label}</span>
                {l.hint && <span className="text-xs text-shell-soft">{l.hint}</span>}
              </Link>
            ))}
            {DIVIDER}
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span id="account-dark" className="flex-1 text-sm">
                {t("account.darkMode", "Dark mode")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={dark}
                aria-labelledby="account-dark"
                onClick={() => setTheme(dark ? "light" : "dark")}
                className={cn(
                  "relative h-6 w-10 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-shell-accent",
                  dark ? "bg-[image:var(--shell-accent-fill)]" : "bg-shell-chip",
                )}
              >
                <i
                  aria-hidden
                  className={cn(
                    "absolute top-[3px] size-[18px] rounded-full bg-white transition-[left]",
                    dark ? "left-[19px]" : "left-[3px]",
                  )}
                />
              </button>
            </div>
            <button type="button" onClick={() => setPanel("language")} className={cn(ROW, "h-[42px]")}>
              <span className="flex-1">{t("common.language", "Language")}</span>
              <span className="text-[13px] text-shell-soft">
                {
                  (supportedLanguages.find((l) => l.code === i18n.language?.split("-")[0]) ?? supportedLanguages[0])
                    .label
                }
              </span>
              <ChevronRight aria-hidden className="size-3.5 text-shell-soft" />
            </button>
            {DIVIDER}
            {tour && (
              <button
                type="button"
                className={ROW}
                onClick={() => {
                  close()
                  window.setTimeout(() => start(tour), 60)
                }}
              >
                {t("account.tour", "A quick tour of this page")}
              </button>
            )}
            <button
              type="button"
              className={ROW}
              onClick={() => {
                close()
                window.setTimeout(openSupport, 60)
              }}
            >
              {t("account.help", "Help and support")}
            </button>
            <button type="button" className={cn(ROW, "font-semibold text-shell-crit")} onClick={() => logout()}>
              {t("nav.userMenu.signOut", "Sign out")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
