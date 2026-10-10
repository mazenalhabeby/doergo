"use client"

import { useTranslation } from "react-i18next"
import { MapPin, X, Plus } from "lucide-react"
import { notify } from "@/lib/toast"
import { locationsApi, type OrgMember } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EditSection } from "./edit-section"
import type { NamedAssignment } from "./use-member-editor-data"

/** The spaces this member works in — remove one, or add them to another. */
export function MemberSpacesSection({
  member,
  locations,
  allAssignments,
  invalidateAssignments,
}: {
  member: OrgMember
  locations: Array<{ id: string; name: string }>
  allAssignments: NamedAssignment[] | undefined
  invalidateAssignments: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <EditSection label={t("members.table.spaces")} />
      <div className="flex flex-wrap gap-1.5 items-center">
        {(() => {
          const memberAssignments = (allAssignments || []).filter(
            (a) => a.userId === member.id,
          )
          const assignedLocationIds = new Set(memberAssignments.map((a) => a.locationId))
          const assignedLocations = locations.filter((l) => assignedLocationIds.has(l.id))
          const unassignedLocations = locations.filter((l) => !assignedLocationIds.has(l.id))

          return (
            <>
              {assignedLocations.length > 0 ? (
                assignedLocations.map((loc) => {
                  const assignment = memberAssignments.find((a) => a.locationId === loc.id)
                  return (
                    <Badge key={loc.id} variant="secondary" className="text-xs font-normal py-0.5 px-2 pr-1 gap-1">
                      <MapPin className="h-3 w-3" />
                      {loc.name}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!assignment?.id) return
                          try {
                            await locationsApi.removeAssignment(loc.id, assignment.id)
                            invalidateAssignments()
                            notify.success(t("members.memberEditor.removedFrom", { name: loc.name }))
                          } catch { notify.error(t("members.memberEditor.failedToRemove")) }
                        }}
                        className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 transition-colors"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </Badge>
                  )
                })
              ) : (
                <span className="text-sm text-muted-foreground/50 italic">{t("members.noSpaces")}</span>
              )}
              {unassignedLocations.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full gap-1">
                      <Plus className="h-3 w-3" />
                      {t("members.memberEditor.add")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {unassignedLocations.map((loc) => (
                      <DropdownMenuItem
                        key={loc.id}
                        onClick={async () => {
                          try {
                            await locationsApi.assignMember(loc.id, { userId: member.id })
                            invalidateAssignments()
                            notify.success(t("members.memberEditor.assignedTo", { name: loc.name }))
                          } catch { notify.error(t("members.memberEditor.failedToAssign")) }
                        }}
                      >
                        <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        {loc.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )
        })()}
      </div>
    </>
  )
}
