"use client"

import { Send, Loader2, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn, formatTimeAgo } from "@/lib/utils"

export interface CommentData {
  id: string
  content: string
  createdAt: string
  user: {
    firstName: string
    lastName: string
  }
}

interface CommentsSectionProps {
  comments: CommentData[]
  newComment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  isSubmitting: boolean
}

// Generate consistent color based on name
function getAvatarColor(firstName: string, lastName: string) {
  const colors = [
    "from-blue-500 to-blue-600",
    "from-purple-500 to-purple-600",
    "from-emerald-500 to-emerald-600",
    "from-amber-500 to-amber-600",
    "from-rose-500 to-rose-600",
    "from-cyan-500 to-cyan-600",
    "from-indigo-500 to-indigo-600",
  ]
  const index = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length
  return colors[index]
}

export function CommentsSection({
  comments,
  newComment,
  onCommentChange,
  onSubmit,
  isSubmitting,
}: CommentsSectionProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && newComment.trim()) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="size-4 text-gray-500" />
            Comments
          </h3>
          {comments.length > 0 && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              {comments.length}
            </span>
          )}
        </div>
      </div>

      {/* Comments List */}
      <div className="p-6">
        {comments.length > 0 ? (
          <div className="space-y-4 mb-6 max-h-[320px] overflow-y-auto pr-2">
            {comments.map((comment, index) => {
              const avatarColor = getAvatarColor(
                comment.user.firstName,
                comment.user.lastName
              )
              const isLast = index === comments.length - 1

              return (
                <div
                  key={comment.id}
                  className={cn(
                    "group",
                    !isLast && "pb-4 border-b border-gray-100"
                  )}
                >
                  <div className="flex gap-3">
                    <Avatar className="size-9 ring-2 ring-white shadow-sm">
                      <AvatarFallback
                        className={cn(
                          "bg-gradient-to-br text-white text-xs font-medium",
                          avatarColor
                        )}
                      >
                        {comment.user.firstName[0]}
                        {comment.user.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {comment.user.firstName} {comment.user.lastName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 mb-6">
            <div className="size-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="size-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 font-medium">No comments yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Be the first to leave a comment
            </p>
          </div>
        )}

        {/* Add Comment Input */}
        <div className="relative">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Textarea
                value={newComment}
                onChange={(e) => onCommentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a comment... (Press Enter to send)"
                className={cn(
                  "resize-none text-sm pr-4 min-h-[80px] rounded-xl",
                  "border-gray-200 focus:border-blue-300 focus:ring-blue-200",
                  "placeholder:text-gray-400 transition-all"
                )}
                rows={3}
              />
            </div>
            <Button
              onClick={onSubmit}
              disabled={!newComment.trim() || isSubmitting}
              className={cn(
                "h-10 w-10 rounded-xl p-0 shrink-0",
                "bg-blue-600 hover:bg-blue-700",
                "shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:shadow-none"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 ml-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
