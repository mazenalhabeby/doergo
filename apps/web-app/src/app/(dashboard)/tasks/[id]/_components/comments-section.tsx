"use client"

import { useTranslation } from "react-i18next"
import { Send, Loader2, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatTimeAgo } from "@/lib/format-date"
import { UserAvatar } from "@/components/user-avatar"

export interface CommentData {
  id: string
  content: string
  createdAt: string
  user: {
    firstName: string
    lastName: string
    avatarUrl?: string | null
  }
}

interface CommentsSectionProps {
  comments: CommentData[]
  newComment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  isSubmitting: boolean
}


export function CommentsSection({
  comments,
  newComment,
  onCommentChange,
  onSubmit,
  isSubmitting,
}: CommentsSectionProps) {
  const { t } = useTranslation()

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && newComment.trim()) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div>
      {/* Comments list */}
      {comments.length > 0 ? (
        <div className="space-y-0 mb-4 max-h-[400px] overflow-y-auto">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 py-3 group">
              {/* Avatar */}
              <UserAvatar
                firstName={comment.user.firstName}
                lastName={comment.user.lastName}
                avatarUrl={comment.user.avatarUrl}
                size="sm"
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {comment.user.firstName} {comment.user.lastName}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    {formatTimeAgo(comment.createdAt)}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 mb-4">
          <p className="text-sm text-muted-foreground/60">{t("tasks.comments.noComments")}</p>
          <p className="text-xs text-muted-foreground/40 mt-0.5">{t("tasks.comments.beTheFirst")}</p>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={newComment}
          onChange={(e) => onCommentChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("tasks.comments.placeholder")}
          className="resize-none text-[13px] min-h-[72px] rounded-xl border-border/60 focus:border-foreground/20 focus:ring-foreground/5 placeholder:text-muted-foreground/40"
          rows={2}
        />
        <Button
          onClick={onSubmit}
          disabled={!newComment.trim() || isSubmitting}
          size="sm"
          className="h-9 w-9 p-0 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 shrink-0"
        >
          {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/40 mt-1.5">{t("tasks.comments.hint")}</p>
    </div>
  )
}
