"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useRouteAccess } from "@/hooks/use-route-access"
import { MY_ITEMS } from "@/components/app-shell/nav/nav-config"

/**
 * What belongs to the person, and which of it they actually have.
 *
 * The employee's own corner of the product — their shifts, their leave, their
 * documents. It was three separate items in the navigation bar, which is three
 * lines of clutter for everybody and still no sense that they are one thing.
 *
 * The menu is labelled HR, by the CEO's decision, and its CONTENTS are the
 * compromise that keeps that honest: strictly self-service, nothing a manager
 * does. The word normally names the FUNCTION — the admin area for the people who
 * run it — so when that area is built it must be called People, or the product
 * ends up with two things called HR meaning opposite ends of the same process.
 *
 * Everything else here still says "my": the route, this hook, the layout. What a
 * member owns is their own, whatever the bar calls it.
 *
 * Manager surfaces stay out. Approving somebody's leave is not "me", and mixing
 * the two is what leaves people unsure whether a screen shows their own days off
 * or their team's.
 *
 * One definition, read by the menu AND by the section's own layout, so a
 * member can never be offered a tab the menu hides — or land on a page that has
 * no tab.
 */
interface MySection {
  href: string
  label: string
  /** Ties the tour and the nav markup to the same entry. */
  tour?: string
}

export function useMySections(): MySection[] {
  // Asked of the route table, so the menu offers exactly what the layout lets through.
  const { may } = useRouteAccess()
  const { t } = useTranslation()

  /*
    The list itself lives in the navigation's data (components/app-shell/nav/nav-config.ts, MY_ITEMS) — the
    sidebar's HR group and these tabs are one list. Notes that used to sit here:
    • "My shifts", not "Attendance": the manager page is already called Attendance, and two entries with one
      name is how somebody ends up on their own record looking for their team's.
    • Shown by the clock module alone (a manager who clocks in must reach their OWN shifts).
    • The time-off tour anchor is "nav-my-timeoff" — the registry spells it without the second hyphen.
  */
  return useMemo(
    () =>
      MY_ITEMS.filter((s) => may(s.href)).map((s) => ({ href: s.href, label: t(s.label, s.fallback), tour: s.tour })),
    [may, t],
  )
}
