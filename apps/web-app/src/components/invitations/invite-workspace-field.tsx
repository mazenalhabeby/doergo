"use client"

import { useTranslation } from "react-i18next"
import { type CompanyLocation } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** The workspace the member joins — optional for staff, required for an external member. */
export function InviteWorkspaceField({
  locations,
  spaceId,
  setSpaceId,
  isExternal,
  hasSpace,
}: {
  locations: CompanyLocation[]
  spaceId: string
  setSpaceId: (id: string) => void
  isExternal: boolean
  hasSpace: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {t("invitations.inviteDialog.spaceLabel")}{" "}
        {isExternal ? (
          <span className="text-destructive">*</span>
        ) : (
          <span className="text-muted-foreground/50">{t("invitations.inviteDialog.optional")}</span>
        )}
      </Label>
      <Select value={spaceId} onValueChange={setSpaceId}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={t("invitations.inviteDialog.spacePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("invitations.inviteDialog.noSpace")}</SelectItem>
          {locations.map((loc: CompanyLocation) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Under the field it is about, and only while it is unmet — this
          is the one thing standing between the admin and a disabled
          Send button, so it has to say so where they are looking. */}
      {isExternal && !hasSpace && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{t("members.invite.externalNeedsSpace")}</p>
      )}
    </div>
  )
}
