"use client"

import { useTranslation } from "react-i18next"
import type { TaskReport } from "@hbcfield/shared/client"
import { formatReportDistance, routePath } from "../_lib/report-model"
import { RouteMapView, Fact } from "./report-blocks"

/** The tracked drive: the map, the distance, from when to when, how close to the site it ended, how many points. */
export function ReportRoute({
  route: rt,
  when,
}: {
  route: NonNullable<TaskReport["route"]>
  when: (iso: string | null | undefined) => string
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "en"
  return (
    <div className="space-y-3">
      <RouteMapView points={rt.points} matchedPath={routePath(rt)} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact label={t("tasks.report.route.distance")} value={formatReportDistance(rt.distanceMeters, locale)} />
        <Fact label={t("tasks.report.route.from")} value={`${when(rt.startedAt)} → ${when(rt.endedAt)}`} />
        <Fact
          label={t("tasks.report.route.arrival")}
          value={rt.arrivalDistanceMeters != null ? formatReportDistance(rt.arrivalDistanceMeters, locale) : "—"}
        />
        <Fact label={t("tasks.report.route.points")} value={String(rt.pointCount)} />
      </dl>
    </div>
  )
}
