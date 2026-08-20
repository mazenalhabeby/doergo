"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { assetsApi, type AssetCategory } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

/**
 * A kind of thing THIS space owns — apartments, vehicles, machines.
 *
 * The kind belongs to the space, so the depot's "Vehicles" and this office's
 * "Vehicles" are separate lists that never see each other.
 */

/** Starting points, so the first one is a click rather than a decision. */
const PRESETS: { name: string; icon: string }[] = [
  { name: "Apartments", icon: "🏠" },
  { name: "Vehicles", icon: "🚐" },
  { name: "Machines", icon: "⚙️" },
  { name: "Tools", icon: "🔧" },
]

export function AssetKindDialog({
  spaceId,
  existing,
  onSaved,
  trigger,
}: {
  spaceId: string
  existing?: AssetCategory
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [icon, setIcon] = useState(existing?.icon ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        icon: icon.trim() || undefined,
        description: description.trim() || undefined,
      }
      return existing
        ? assetsApi.updateCategory(existing.id, input)
        : assetsApi.createCategory({ ...input, spaceId })
    },
    onSuccess: () => {
      notify.success(existing ? t("common.saved", "Saved") : t("assetKinds.created", "{{name}} added", { name: name.trim() }))
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const reset = (next: boolean) => {
    if (next) {
      setName(existing?.name ?? "")
      setIcon(existing?.icon ?? "")
      setDescription(existing?.description ?? "")
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing ? t("assetKinds.editTitle", "Edit kind") : t("assetKinds.newTitle", "New kind")}
          </DialogTitle>
          <DialogDescription>
            {t("assetKinds.hint", "A kind of thing this space owns. You add the individual ones inside it.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!existing && (
            <div>
              <Label className="text-xs text-muted-foreground">{t("assetKinds.startFrom", "Start from")}</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => { setName(p.name); setIcon(p.icon) }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {p.icon} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="w-20">
              <Label className="text-xs text-muted-foreground">{t("assetKinds.icon", "Icon")}</Label>
              <Input className="mt-1" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏠" maxLength={4} />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">{t("assetKinds.name", "Name")}</Label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("assetKinds.namePlaceholder", "Apartments")}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetKinds.description", "Description")}{" "}
              <span className="text-muted-foreground/60">{t("common.optional", "(optional)")}</span>
            </Label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("assetKinds.descriptionPlaceholder", "The flats we rent out")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? t("common.save", "Save") : t("common.create", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
