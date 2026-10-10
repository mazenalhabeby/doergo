"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { documentsApi } from "@/lib/api"
import { notify } from "@/lib/toast"

/**
 * Open one document in a new tab. Minting the link IS the "opened" event on
 * the server, which is why no list carries a URL — every screen that opens a
 * document asks for one here. `opening` is the id whose link is on its way,
 * for that row's spinner.
 */
export function useOpenDocument({
  errorMessage = (e) => e.message,
  onOpened,
}: {
  /** What the toast says when no link came back. */
  errorMessage?: (e: Error) => string
  /** After the tab opened — e.g. to refresh a list that shows "unopened". */
  onOpened?: () => void
} = {}) {
  const [opening, setOpening] = useState<string | null>(null)
  const open = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(id),
    onMutate: (id: string) => setOpening(id),
    onSettled: () => setOpening(null),
    onSuccess: (res: { url?: string } | null | undefined) => {
      if (!res?.url) return
      // A new tab rather than a same-tab navigation: losing the list to a PDF
      // viewer and having to come back is the most common complaint about
      // document portals.
      window.open(res.url, "_blank", "noopener,noreferrer")
      onOpened?.()
    },
    onError: (e: Error) => notify.error(errorMessage(e)),
  })
  return { open, opening }
}
