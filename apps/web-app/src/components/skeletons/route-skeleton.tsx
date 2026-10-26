"use client"

import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ClientRecordSkeleton } from "./crm"
import { DashboardPageSkeleton, dashboardVariant } from "@/components/skeletons/dashboard-page-skeleton"
import { TasksPageLoading } from "@/components/skeletons/tasks-skeleton"
import { TaskDetailPageSkeleton } from "./task-detail-skeleton"
import { JobReportPageSkeleton } from "@/components/skeletons/report-skeleton"
import { useAuth } from "@/contexts/auth-context"
import { pageShape, type PageShape } from "./page-shape"
import { CalendarShape, DetailShape, FormShape, ListShape, MessagesShape } from "./page-shapes"

const SHAPES: Record<Exclude<PageShape, "dashboard">, () => React.JSX.Element> = {
  list: ListShape,
  detail: DetailShape,
  form: FormShape,
  calendar: CalendarShape,
  messages: MessagesShape,
}

/**
 * What the current page draws while it loads — the ONE answer for the dashboard's `loading.tsx`, the layout's
 * Suspense boundary, and any page that waits for its route. The shape comes from `pageShape` (six shapes cover
 * every page); a page that draws its OWN skeleton while its data loads is named here, so the route stage and the
 * page stage are the same silhouette and the page only ever fills in, never re-arranges.
 *
 * Held back 200 ms (`.skeleton-wait`): a page that arrives sooner shows no grey flash at all.
 */
export function RouteSkeleton() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { t } = useTranslation()
  return (
    <div className="skeleton-wait h-full" role="status" aria-busy="true" aria-label={t("common.loading", "Loading")}>
      {pageSkeleton(pathname, user)}
    </div>
  )
}

function pageSkeleton(pathname: string, user: Parameters<typeof dashboardVariant>[0]) {
  // The pages below draw these themselves while their data loads.
  if (/^\/tasks\/[^/]+\/report\/?$/.test(pathname)) return <JobReportPageSkeleton />
  if (/^\/tasks\/(?!recurring\/?$)[^/]+\/?$/.test(pathname)) return <TaskDetailPageSkeleton />
  // The list in the view the user left it in (table / board / schedule).
  if (pathname === "/tasks") return <TasksPageLoading />
  if (/^\/(clients|customers)\/[^/]+\/?$/.test(pathname)) return <ClientRecordSkeleton />

  const shape = pageShape(pathname)
  // The dashboard has three layouts; draw the one this user will get (the admin grid while `user` is unknown).
  if (shape === "dashboard") return <DashboardPageSkeleton variant={dashboardVariant(user)} />
  const Shape = SHAPES[shape]
  return <Shape />
}
