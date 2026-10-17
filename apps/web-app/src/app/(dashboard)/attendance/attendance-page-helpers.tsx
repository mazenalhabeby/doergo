"use client"

import dynamic from "next/dynamic"

/** AttendancePage's module-level helpers, moved here unchanged so its sections can read them too. */
// Lazy (audit AT-C1). Four tabs of which one shows, plus a dialog that renders on
// a click — ~2,600 lines in the first paint. ssr:false: none renders on the server.
export const BreaksTab = dynamic(() => import("./_components/breaks-tab").then((m) => m.BreaksTab), { ssr: false })

export const TrackingTab = dynamic(() => import("./_components/tracking-tab").then((m) => m.TrackingTab), { ssr: false })

export const NoShowsTab = dynamic(() => import("./_components/no-shows-tab").then((m) => m.NoShowsTab), { ssr: false })

export const AddDayOffDialog = dynamic(() => import("./_components/add-dayoff-dialog").then((m) => m.AddDayOffDialog), { ssr: false })

export const AddAttendanceDialog = dynamic(
  () => import("../members/[id]/_components/add-attendance-dialog").then((m) => m.AddAttendanceDialog),
  { ssr: false })
