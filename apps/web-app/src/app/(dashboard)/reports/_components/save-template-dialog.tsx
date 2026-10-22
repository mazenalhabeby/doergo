"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { analyticsApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import type { ActiveReport, ReportBuilder } from "../_hooks/use-report-builder"

export type SaveMeta = { name: string; description: string; isShared: boolean }

type SaveTemplateDialogProps = Pick<ReportBuilder, "setActive" | "canBuild"> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: SaveMeta
  onMetaChange: (meta: SaveMeta) => void
  active: ActiveReport | null
}

/** Save the report as a template — or update the template it came from. */
export function SaveTemplateDialog({
  open: saveOpen,
  onOpenChange: setSaveOpen,
  meta: saveMeta,
  onMetaChange: setSaveMeta,
  active,
  setActive,
  canBuild,
}: SaveTemplateDialogProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      if (!active) return
      const input = {
        name: saveMeta.name,
        description: saveMeta.description,
        config: active.def,
        isShared: saveMeta.isShared,
      }
      return active.savedId ? analyticsApi.updateSaved(active.savedId, input) : analyticsApi.createSaved(input)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: keys.reports.saved() })
      setSaveOpen(false)
      if (r) setActive({ def: r.config, name: r.name, builder: canBuild, savedId: r.id })
      notify.success(t("reports.saved", "Report saved"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to save"),
  })

  return (
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {active?.savedId
              ? t("reports.updateTemplateTitle", "Update template")
              : t("reports.saveTemplateTitle", "Save as template")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("reports.name", "Name")} *</Label>
            <Input
              value={saveMeta.name}
              onChange={(e) => setSaveMeta({ ...saveMeta, name: e.target.value })}
              placeholder="Weekly overtime"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("reports.description", "Description")}</Label>
            <Input
              value={saveMeta.description}
              onChange={(e) => setSaveMeta({ ...saveMeta, description: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t("reports.shareOrg", "Share with the whole organization")}</Label>
            <Switch checked={saveMeta.isShared} onCheckedChange={(v) => setSaveMeta({ ...saveMeta, isShared: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setSaveOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={!saveMeta.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
