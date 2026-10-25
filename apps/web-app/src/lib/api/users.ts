import { call, type ApiResponse } from "../http-client"
import { apiError } from "../server-error"
import type { InboxNotification } from "./types/users"
import { notificationsEndpoints, usersEndpoints } from "@hbcfield/shared/client"

export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const

export const usersApi = {
  // In-app notification inbox — persisted notifications + unread count.
  getNotifications: async (limit = 30) => {
    const response = (await call(notificationsEndpoints.list, undefined, { query: { limit } })) as ApiResponse<{
      data: { items: InboxNotification[]; unread: number }
    }>
    if (response.error) throw apiError(response)
    return response.data?.data ?? { items: [], unread: 0 }
  },

  // Mark notifications read (all unread, or specific ids).
  markNotificationsRead: async (ids?: string[]) => {
    const response = (await call(notificationsEndpoints.markRead, undefined, {
      body: ids ? { ids } : {},
    })) as ApiResponse<{ success: boolean }>
    if (response.error) throw apiError(response)
    return response.data
  },

  // Your OWN notification switches, and which member emails the organization
  // allows at all (the ceiling — see notifications/email-prefs in shared).
  getMyNotificationPrefs: async () => {
    const response = (await call(notificationsEndpoints.prefs)) as ApiResponse<{
      data: { prefs: Record<string, boolean>; organizationAllows: Record<string, boolean> }
    }>
    if (response.error) throw apiError(response)
    return {
      prefs: response.data?.data?.prefs ?? {},
      organizationAllows: response.data?.data?.organizationAllows ?? {},
    }
  },

  // Merge-update your OWN notification switches (only the keys given change).
  updateMyNotificationPrefs: async (prefs: Record<string, boolean>) => {
    const response = (await call(notificationsEndpoints.updatePrefs, undefined, { body: { prefs } })) as ApiResponse<{
      data: Record<string, boolean>
    }>
    if (response.error) throw apiError(response)
    return response.data?.data ?? {}
  },

  // Update your OWN profile (any authenticated user — no admin permission).
  updateMe: async (data: {
    firstName?: string
    lastName?: string
    presence?: "AVAILABLE" | "BUSY" | "AWAY" | null
    timeFormat?: "12h" | "24h"
    guidesSeen?: boolean
    locale?: string
    clockInPick?: "AUTO" | "ASK"
    usesClock?: boolean
  }) => {
    const response = (await call(usersEndpoints.updateMe, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { id: string; firstName: string; lastName: string }
    }>
    if (response.error) throw apiError(response)
    return response.data?.data
  },

  // Change your OWN email — requires current password, enforces uniqueness.
  updateMyEmail: async (data: { newEmail: string; currentPassword: string }) => {
    const response = (await call(usersEndpoints.updateEmail, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { id: string; email: string }
    }>
    if (response.error) throw apiError(response)
    return response.data?.data
  },

  // Upload avatar image directly to the API gateway
  uploadAvatar: async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    // Through the pipeline: token, refresh on 401, timeout.
    const response = (await call(usersEndpoints.uploadAvatar, undefined, { body: formData })) as ApiResponse<{
      data: { avatarUrl: string }
    }>
    if (response.error) throw apiError({ ...response, error: response.error || "Upload failed" })
    return response.data?.data as { avatarUrl: string }
  },

  // Remove avatar
  removeAvatar: async () => {
    const response = (await call(usersEndpoints.removeAvatar)) as ApiResponse<{ success: boolean }>
    if (response.error) throw apiError(response)
    return response.data
  },
}
