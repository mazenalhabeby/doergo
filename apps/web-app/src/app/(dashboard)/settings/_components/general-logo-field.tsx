"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, Image as ImageIcon, Upload, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { organizationsApi, type OrganizationProfile } from "@/lib/api"
import { FormField } from "./settings-form-bits"
import { resizeImageToDataUrl } from "../_lib/resize-image"

/** The company logo: shown, uploaded (resized to 400px) or removed — saved at once, outside the form's Save. */
export function GeneralLogoField({ profile }: { profile: OrganizationProfile | undefined }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [logoBusy, setLogoBusy] = useState(false)
  const saveLogo = async (logoUrl: string) => {
    setLogoBusy(true)
    try {
      await organizationsApi.updateProfile({ logoUrl })
      queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
      notify.success(
        logoUrl ? t("settings.general.logoSaved", "Logo updated") : t("settings.general.logoRemoved", "Logo removed"),
      )
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("settings.general.failed"))
    } finally {
      setLogoBusy(false)
    }
  }
  const onLogoPick = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      notify.error(t("settings.general.logoType", "Please choose an image file"))
      return
    }
    setLogoBusy(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400)
      await saveLogo(dataUrl)
    } catch {
      setLogoBusy(false)
      notify.error(t("settings.general.logoFailed", "Could not process that image"))
    }
  }
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
