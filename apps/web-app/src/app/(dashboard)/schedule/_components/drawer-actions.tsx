"use client"

import Link from "next/link"
import { format, parseISO } from "date-fns"
import { Clock, Inbox } from "lucide-react"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"

import { type OrgTimeOffRequest } from "@/lib/api"
import { requestKindOf } from "@/lib/requests"
import { Button } from "@/components/ui/button"
import type { PickedDay } from "./day-hours-form"

/**
 * The drawer's foot. A pending request is decided in Approvals — the one place. Changed hours for
 * one day that are already approved (set by the office, or a member's request) say who set them
 * and can be changed again here, through the same form as the wallchart.
 */
export function DrawerActions({
  request,
  canManage,
  onChangeHours,
}: {
  request: OrgTimeOffRequest
  canManage: boolean
  onChangeHours?: (pick: Omit<PickedDay, "self">) => void
}) {
  const { t } = useTranslation()
  if (canManage && request.status === "PENDING") {
    return (
      <div className="border-t border-border px-5 py-3.5">
        <Button asChild className="w-full">
          <Link href={`/approvals?kind=request&id=${encodeURIComponent(request.id)}`}>
            <Inbox className="h-4 w-4" />
            {t("approvals.decideInApprovals")}
          </Link>
        </Button>
      </div>
    )
  }
  const oneDay = request.startDate.slice(0, 10) === request.endDate.slice(0, 10)
  if (request.status !== "APPROVED" || requestKindOf(request.kind) !== "HOURS" || !oneDay || !request.spaceId)
    return null
  return (
    <div className="space-y-2.5 border-t border-border px-5 py-3.5">
      {request.approvedBy && (
        <p className="text-[12.5px] text-muted-foreground">
          {t("dayHours.setBy", {
            name: personName(request.approvedBy),
            date: request.approvedAt ? format(parseISO(request.approvedAt), "d MMM, HH:mm") : "",
          })}
        </p>
      )}
      {onChangeHours && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            onChangeHours({
              personId: request.technicianId,
              personName: personName(request.technician),
              firstName: request.technician.firstName,
              dayKey: request.startDate.slice(0, 10),
              spaceId: request.spaceId!,
              spaceName: request.space?.name ?? "",
            })
          }
        >
          <Clock className="h-4 w-4" />
          {t("dayHours.change")}
        </Button>
      )}
    </div>
  )
}
