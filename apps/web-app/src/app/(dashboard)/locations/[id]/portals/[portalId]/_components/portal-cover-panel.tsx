"use client"

import { Trash2, Loader2, Upload, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PortalDetailPageState } from "../_hooks/use-portal-detail-page"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function PortalCoverPanel({ vm }: { vm: PortalDetailPageState }) {
  const { t, portal, mayManage, coverInputRef, uploadCoverM, removeCoverM } = vm
  return (
    <>
      {/* Cover image — previewed exactly as the app shows it (full-screen
          portrait background on the client's home), so it looks right on web too. */}
      <div className="mb-6 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-stretch">
        {/* Phone-frame preview */}
        <div
          className={
            "relative aspect-[9/16] w-[168px] shrink-0 overflow-hidden rounded-[24px] " +
            "border-[5px] border-foreground/15 bg-muted shadow-lg"
          }
        >
          {portal?.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portal.coverImageUrl}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">{t("portal.noCover", "No cover image")}</span>
            </div>
          )}
          {/* Legibility gradient + the app-home title overlay (what the client sees). */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/25" />
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50" />
          <div className="absolute inset-x-0 bottom-0 p-3 text-white">
            {portal?.entityLabel && (
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">{portal.entityLabel}</p>
            )}
            <p className="text-sm font-semibold leading-tight drop-shadow">{portal?.name}</p>
          </div>
        </div>

        {/* Controls + guidance */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 text-center sm:text-left">
          <p className="text-sm font-semibold text-foreground">{t("portal.coverTitle", "Client home cover")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              "portal.coverHint2",
              "Fills the background of the client's home screen in the app. Use a tall " +
                "(portrait) image — this preview shows exactly how they'll see it.",
            )}
          </p>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadCoverM.mutate(f)
              e.currentTarget.value = ""
            }}
          />
          <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!mayManage || uploadCoverM.isPending}
              onClick={() => coverInputRef.current?.click()}
            >
              {uploadCoverM.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {portal?.coverImageUrl ? t("portal.changeCover", "Change") : t("portal.uploadCover", "Upload cover")}
            </Button>
            {portal?.coverImageUrl && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={removeCoverM.isPending}
                onClick={() => removeCoverM.mutate()}
              >
                {removeCoverM.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {t("common.remove", "Remove")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
