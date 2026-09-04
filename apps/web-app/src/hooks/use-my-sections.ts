"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { hasAccessModule } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"

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
export interface MySection {
  href: string
  label: string
  /** Ties the tour and the nav markup to the same entry. */
  tour?: string
}

export function useMySections(): MySection[] {
  const { user, hasPlanFeature } = useAuth()
  const { t } = useTranslation()

  return useMemo(() => {
    const sections: (MySection & { show: boolean })[] = [
      {
        href: "/my/attendance",
        /*
          "My shifts", not "Attendance".

          The manager page in the Time & attendance menu is already called
          Attendance, and two entries with one name in one bar is how somebody
          ends up on their own record looking for their team's.
        */
        label: t("nav.myShifts", "My shifts"),
        tour: "nav-my-attendance",
        /*
          The clock module, and nothing else.

          It used to be `clock && !showAttendance` — hidden from anyone who had
          the manager attendance page, to stop two attendance entries sitting in
          one bar. That was a clutter workaround with a real cost: a manager who
          clocks in had no way to reach their OWN shifts. The two now live in
          different menus, so the workaround can go.
        */
        show: hasAccessModule(user ?? {}, "clock"),
      },
      {
        href: "/my/time-off",
        label: t("nav.sidebar.timeOff", "Time off"),
        // The registry spells it without the second hyphen; the anchor has to
        // match it exactly or the welcome tour's step points at nothing.
        tour: "nav-my-timeoff",
        show: hasAccessModule(user ?? {}, "time_off"),
      },
      {
        href: "/my/documents",
        label: t("nav.sidebar.myDocuments", "My documents"),
        tour: "nav-my-documents",
        // A plan capability rather than a module: documents are bought for the
        // organization, not switched on per workspace.
        show: hasPlanFeature("documents"),
      },
    ]
    return sections.filter((s) => s.show).map(({ show: _show, ...s }) => s)
  }, [user, hasPlanFeature, t])
}
