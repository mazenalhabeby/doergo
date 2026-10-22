"use client"

import { useTranslation } from "react-i18next"
import type { Customer } from "@/lib/api"
import { Label } from "@/components/ui/label"

/**
 * Which workspace's client list this client belongs to: a required choice when several could take a new
 * client, a sentence when only one can, and a move (with its consequence spelled out) when editing.
 */
export function CustomerWorkspaceField({
  existing,
  needsSpace,
  showSpace,
  crmSpaces,
  chosenSpace,
  setChosenSpace,
}: {
  existing?: Customer
  needsSpace: boolean
  showSpace: boolean
  crmSpaces: { id: string; name: string }[]
  chosenSpace: string
  setChosenSpace: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {showSpace && (crmSpaces.length > 1 || existing) && (
        <div className="space-y-1">
          <Label>
            {t("customers.workspace", "Workspace")}
            {!existing && <span className="text-destructive"> *</span>}
          </Label>
          <select
            value={chosenSpace}
            onChange={(e) => setChosenSpace(e.target.value)}
            className={
              "h-9 w-full rounded-md border border-input bg-background px-3 text-sm " +
              "text-foreground focus-visible:outline-none focus-visible:ring-1 " +
              "focus-visible:ring-ring"
            }
          >
            <option value="">
              {existing
                ? t("customers.workspaceNone", "No workspace")
                : t("customers.workspacePick", "Choose a workspace…")}
            </option>
            {crmSpaces.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            {existing
              ? t(
                  "customers.workspaceMoveHint",
                  "Moving this client takes it out of one workspace's list and into another.",
                )
              : t("customers.workspaceHint", "Which workspace's client list this belongs to.")}
          </p>
        </div>
      )}
      {needsSpace && !existing && crmSpaces.length === 1 && (
        // Said, not asked — one workspace answers the question itself, but a
        // client still lands somewhere and the reader should know where.
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
          {t("customers.workspaceOnly", "Added to {{name}}.", { name: crmSpaces[0].name })}
        </p>
      )}
    </>
  )
}
