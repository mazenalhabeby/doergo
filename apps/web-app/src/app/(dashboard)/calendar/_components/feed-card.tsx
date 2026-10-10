"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Copy, Link2, RefreshCw, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { calendarApi } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { copyText } from "@/lib/clipboard"
import { keys } from "@/lib/query-keys"

/**
 * "See it in Google" — optional and one-way. The link is shown once (only its hash is stored), so
 * this card offers to make a new one rather than to show the old one again.
 */
export function FeedCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [url, setUrl] = useState<string | null>(null)
  const { data } = useQuery({ queryKey: keys.calendar.feed(), queryFn: calendarApi.feedStatus, staleTime: 60_000 })
  const rotate = useMutation({
    mutationFn: calendarApi.feedRotate,
    onSuccess: (r) => {
      setUrl(`${window.location.origin}${r.path}`)
      qc.invalidateQueries({ queryKey: keys.calendar.feed() })
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  const revoke = useMutation({
    mutationFn: calendarApi.feedRevoke,
    onSuccess: () => { setUrl(null); qc.invalidateQueries({ queryKey: keys.calendar.feed() }); toast.success(t("calendar.feed.revoked")) },
  })
  if (!data?.allowed) return null

  const copy = async () => {
    if (!url) return
    // On a refused copy the link is still shown, so it can be copied by hand.
    if (await copyText(url)) toast.success(t("calendar.feed.copied"))
    else toast.message(url)
  }

  return (
    <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4 text-primary" />{t("calendar.feed.title")}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("calendar.feed.body")}</p>
      {url ? (
        <div className="mt-3 space-y-2">
          <div className="truncate rounded-lg border border-dashed bg-muted/40 px-2.5 py-2 font-mono text-[11px] text-muted-foreground" title={url}>{url}</div>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("calendar.feed.once")}</p>
          <Button size="sm" className="w-full gap-1.5" onClick={copy}><Copy className="h-3.5 w-3.5" />{t("calendar.feed.copy")}</Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
            {data.active ? <RefreshCw className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {data.active ? t("calendar.feed.newLink") : t("calendar.feed.make")}
          </Button>
          {data.active && (
            <Button size="sm" variant="ghost" aria-label={t("calendar.feed.revoke")} title={t("calendar.feed.revoke")} onClick={() => revoke.mutate()}>
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
