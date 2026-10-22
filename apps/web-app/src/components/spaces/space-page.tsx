"use client"

import type { ComponentType, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"

/**
 * Pieces of the workspace pages — the owner's (/locations/[id]) and a guest's
 * shared view (/shared/[id]) open the same way: a link back to the
 * workspaces, and a centred notice when there is nothing to show.
 */

export function BackToSpaces() {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push("/locations")}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("scheduling.backToSpaces")}
    </button>
  )
}

/** Icon in a soft tile, a title, a line of explanation and an optional action under it. */
export function CenteredNotice({
  icon: Icon,
  title,
  description,
  className = "py-24",
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: ReactNode
  description: ReactNode
  /** Vertical room; the empty workspace list sits a little tighter. */
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={`flex flex-col items-center justify-center ${className} text-center`}>
      <div className="rounded-2xl bg-muted/50 p-5 mb-5">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {description}
      </p>
      {children}
    </div>
  )
}
