"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { MessageSquare } from "lucide-react"
import { personName, chatPresenceLabel } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useContactActions } from "@/hooks/use-contact-actions"
import { ChatAvatar } from "@/components/chat/chat-avatar"

/**
 * A colleague's short card, for somebody who may not open the full member page:
 * exactly what Team knows (GET /people/:id — built from the caller's own lists).
 */
export function PersonDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { message } = useContactActions()
  const { data, isError } = useQuery({
    queryKey: keys.people.person(userId ?? ""),
    queryFn: () => chatApi.person(userId!),
    enabled: !!userId,
    staleTime: 60_000,
    retry: false,
  })
  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">{data ? personName(data) : t("team.profile", "Profile")}</DialogTitle>
        </DialogHeader>
        {isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("team.notVisible", "This person is not on your team.")}
          </p>
        ) : !data ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <ChatAvatar u={data} size={72} />
            <div>
              <p className="text-lg font-semibold">{personName(data)}</p>
              {data.position && <p className="text-sm text-muted-foreground">{data.position}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{chatPresenceLabel(data.presence, t)}</p>
            </div>
            {!!data.workspaces?.length && (
              <p className="text-xs text-muted-foreground">{data.workspaces.join(" · ")}</p>
            )}
            {data.canMessage && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  message(data.id)
                }}
                className={"flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm " +
                  "font-semibold text-primary-foreground hover:opacity-90"}
              >
                <MessageSquare className="size-4" />
                {t("chat.message", "Message")}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
