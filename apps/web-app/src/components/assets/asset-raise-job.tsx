"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Wrench } from "lucide-react"

import { tasksApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"

/**
 * Raise a job about this thing.
 *
 * The record already knew what happened to it; it could not be the REASON
 * anything happened. A task carries assetId, and the asset's History has always
 * queried it — there was simply no way to make one, so the tab was permanently
 * empty and nobody could tell whether that meant "no work" or "not wired up".
 *
 * The job lands in the SPACE that owns the asset's type, so it enters that
 * space's workflow rather than appearing somewhere nobody is looking.
 */
export function AssetRaiseJob({
  assetId, assetName, spaceId, faultCode, onRaised,
}: {
  assetId: string
  assetName: string
  /** The space this asset's type belongs to. */
  spaceId?: string | null
  /** Pre-filled when raised from a fault code, so the job says what it is. */
  faultCode?: { code: string; meaning: string; fix?: string }
  onRaised?: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")

  const reset = (next: boolean) => {
    if (next) {
      setTitle(faultCode ? `${faultCode.code} — ${faultCode.meaning}` : "")
      setDescription(faultCode?.fix ?? "")
    }
    setOpen(next)
  }

  const raise = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        assetId,
        ...(spaceId ? { spaceId } : {}),
      }),
    onSuccess: (task: { id?: string } | undefined) => {
      notify.success(t("assetJobs.raised", "Job raised"))
      setOpen(false)
      onRaised?.()
      if (task?.id) router.push(`/tasks/${task.id}`)
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Wrench className="mr-1.5 h-3.5 w-3.5" /> {t("assetJobs.raise", "Raise a job")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("assetJobs.title", "Raise a job")}</DialogTitle>
          <DialogDescription>
            {t("assetJobs.hint", "About {{name}}. It goes to the workspace this one belongs to.", { name: assetName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs text-muted-foreground">{t("assetJobs.what", "What needs doing")}</Label>
            <Input
              autoFocus
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("assetJobs.whatPh", "Replace the drive belt")}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("assetJobs.detail", "Detail")}{" "}
              <span className="text-muted-foreground/60">{t("common.optional", "(optional)")}</span>
            </Label>
            <Input
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("assetJobs.detailPh", "Anything the person going should know")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!title.trim() || raise.isPending} onClick={() => raise.mutate()}>
            {raise.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("assetJobs.raise", "Raise a job")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
