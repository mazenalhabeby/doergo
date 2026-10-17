"use client"

import { personName } from "@hbcfield/shared/client"
import { useState, useEffect, useCallback, useRef } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import {
  Bell, UserPlus, ClipboardList, MessageSquare, CheckCircle,
  Clock, MapPin, Coffee, Paperclip, XCircle, Send, ClipboardCheck, PenLine, CalendarDays,
  Receipt, Package,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { formatTimeAgo } from "@/lib/format-date"
import { isSameAppPath } from "@/lib/safe-links"
import type { TFunction } from "i18next"
import { useQuery } from "@tanstack/react-query"

import { usersApi, type InboxNotification } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { useChat } from "@/components/chat/chat-context"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { useNotificationBell, type NotificationType } from "./use-notification-bell"
import { TYPE_CONFIG } from "./notification-bell-helpers"

// ============================================================================
// Config — icon + color per notification type (DRY)
// ============================================================================

// ============================================================================
// Component
// ============================================================================

export function NotificationBell() {
  const {
    t,
    notifications,
    open,
    setOpen,
    isConnected,
    unreadCount,
    markAllRead,
    clearAll,
    handleClick,
  } = useNotificationBell()

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && unreadCount > 0) markAllRead() }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-lg">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 rounded-xl shadow-xl border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t("notifications.title")}</h3>
            {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
          </div>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={markAllRead}>
                {t("notifications.markAllRead")}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground" onClick={clearAll}>
                {t("notifications.clearAll")}
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
            </div>
          ) : (
            notifications.map(notif => {
              const config = TYPE_CONFIG[notif.type]
              const Icon = config.icon
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    "w-full flex gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 border-b border-border last:border-0",
                    !notif.read && "bg-primary/5"
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", notif.read ? "text-muted-foreground" : "text-foreground font-medium")}>
                      {notif.title}
                    </p>
                    {notif.message && <p className="text-xs text-foreground/70 truncate">{notif.message}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatTimeAgo(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.read && (
                    <div className="flex items-center">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
