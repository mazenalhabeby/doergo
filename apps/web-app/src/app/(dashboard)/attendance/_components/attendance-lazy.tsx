"use client"

import dynamic from "next/dynamic"

/** The attendance page's tabs and header dialogs, each loaded only when it is shown. */
// Lazy (audit AT-C1). Four tabs of which one shows, plus a dialog that renders on
// a click — ~2,600 lines in the first paint. ssr:false: none renders on the server.
export const BreaksTab = dynamic(() => import("./breaks-tab").then((m) => m.BreaksTab), { ssr: false })

export const TrackingTab = dynamic(() => import("./tracking-tab").then((m) => m.TrackingTab), { ssr: false })

export const NoShowsTab = dynamic(() => import("./no-shows-tab").then((m) => m.NoShowsTab), { ssr: false })

export const AddDayOffDialog = dynamic(() => import("./add-dayoff-dialog").then((m) => m.AddDayOffDialog), {
  ssr: false,
})

export const AddAttendanceDialog = dynamic(
  () => import("../../../../components/attendance/add-attendance-dialog").then((m) => m.AddAttendanceDialog),
  { ssr: false },
)
