"use client"

import { Loader2, Image as ImageIcon, Upload, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FormField } from "./settings-form-bits"
import type { GeneralSectionState } from "./use-general-section"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function GeneralLogoField({ vm }: { vm: GeneralSectionState }) {
  const { t, profile, logoBusy, onLogoPick, saveLogo } = vm
  return (
    <>
      <FormField icon={ImageIcon} label={t("settings.general.logo", "Company logo")}>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-xl border border-border bg-muted/40 grid place-items-center overflow-hidden">
            {profile?.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */ <img
                src={profile.logoUrl}
                alt="Logo"
                decoding="async"
                className="h-full w-full object-contain"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <label
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border " +
                    "border-border text-sm font-medium cursor-pointer hover:bg-accent/50 " +
                    "transition-colors",
                  logoBusy && "opacity-60 pointer-events-none",
                )}
              >
                {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {profile?.logoUrl
                  ? t("settings.general.logoReplace", "Replace")
                  : t("settings.general.logoUpload", "Upload logo")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    onLogoPick(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
              </label>
              {profile?.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-red-600 hover:text-red-700"
                  disabled={logoBusy}
                  onClick={() => saveLogo("")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("settings.general.logoRemove", "Remove")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {t("settings.general.logoHint", "PNG or JPG. Shows on report & statement PDFs. Saved instantly.")}
            </p>
          </div>
        </div>
      </FormField>
    </>
  )
}
