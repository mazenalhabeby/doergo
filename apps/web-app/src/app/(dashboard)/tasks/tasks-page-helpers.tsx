"use client";

import dynamic from "next/dynamic";

/** TasksPage's module-level helpers, moved here unchanged so its sections can read them too. */
// Lazy (audit T-C1). Only ONE view renders at a time and the dialogs render on a
// click, but all of them were in the first paint of the heaviest page in the
// product — the create dialog alone is 1,402 lines, the timeline 702. The default
// board (KanbanBoard / TaskTableRow) stays static so the primary path has no
// loading flash. ssr:false: none of these renders on the server. The schedule's
// views, the grouped list and the sprint dialogs are lazy in their own files.
// Shown only on the Recurring tab — loaded when opened, like the other alternate views.
export const RecurringPanel = dynamic(() => import("./recurring/recurring-view").then((m) => m.RecurringPanel), { ssr: false })

export const CreateTaskDialog = dynamic(() => import("./_components/create-task-dialog").then((m) => m.CreateTaskDialog), { ssr: false })
