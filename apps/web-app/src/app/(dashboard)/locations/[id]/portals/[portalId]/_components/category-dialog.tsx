"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { portalAdminApi, type PortalCategoryInput, type PortalIntakeCategory } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

const COLORS = ["emerald", "blue", "amber", "purple", "cyan", "indigo", "red", "orange", "slate"]

/** Add or edit an issue category: its label, colour, team, sub-issues and whether its requests are urgent. */
export function CategoryDialog({
  portalId,
  catEdit,
  setCatEdit,
  catForm,
  setCatForm,
}: {
  portalId: string
  /** The category being edited, "new", or null when closed. */
  catEdit: PortalIntakeCategory | "new" | null
  setCatEdit: (v: PortalIntakeCategory | "new" | null) => void
  catForm: PortalCategoryInput
  setCatForm: (v: PortalCategoryInput) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const saveCatM = useMutation({
    mutationFn: () =>
      catEdit === "new"
        ? portalAdminApi.createCategory({
            ...catForm,
            portalId,
            key: catForm.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          })
        : portalAdminApi.updateCategory((catEdit as PortalIntakeCategory).id, catForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.portal.detail(portalId) })
      setCatEdit(null)
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  return (
    <Dialog open={!!catEdit} onOpenChange={(o) => !o && setCatEdit(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {catEdit === "new" ? t("portal.addCategory", "Add category") : t("portal.editCategory", "Edit category")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("portal.catLabel", "Label")}</Label>
            <Input
              value={catForm.label}
              onChange={(e) => setCatForm({ ...catForm, label: e.target.value })}
              placeholder={t("portal.catLabelPlaceholder", "Air Conditioning")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("portal.catColor", "Colour")}</Label>
              <select
                value={catForm.color}
                onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}
              >
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("portal.catTeam", "Route to team")}</Label>
              <Input
                value={catForm.team ?? ""}
                onChange={(e) => setCatForm({ ...catForm, team: e.target.value })}
                placeholder={t("portal.catTeamPlaceholder", "HVAC team")}
              />
            </div>
          </div>
          <div>
            <Label>{t("portal.catIssues", "Sub-issues (comma separated)")}</Label>
            <Input
              value={(catForm.issues ?? []).join(", ")}
              onChange={(e) =>
                setCatForm({
                  ...catForm,
                  issues: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder={t("portal.catIssuesPlaceholder", "Not cooling, No power")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={!!catForm.urgent}
              onChange={(e) => setCatForm({ ...catForm, urgent: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary"
            />
            {t("portal.catUrgent", "Auto-mark requests in this category as URGENT")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setCatEdit(null)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={!catForm.label.trim() || saveCatM.isPending} onClick={() => saveCatM.mutate()}>
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
