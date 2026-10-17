"use client"

/** Every socket event the web listens to, by name (moved here unchanged). */
/** Which socket events refresh which queries — the table useRealtimeSync reads (moved here unchanged). */
// All Socket.IO event names — single source of truth
export const Events = {
  // Tasks
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_ASSIGNED: "task.assigned",
  TASK_STATUS_CHANGED: "task.statusChanged",
  TASK_COMMENT_ADDED: "task.commentAdded",
  TASK_ATTACHMENT_ADDED: "task.attachmentAdded",
  TASK_DECLINED: "task.declined",
  TASK_DELETED: "task.deleted",
  // Paused at a clock-out, and the handover note (shared tasks/handover.ts)
  TASKS_PAUSED: "tasks.paused",
  TASK_HANDOVER_ADDED: "task.handoverAdded",
  // Attendance
  CLOCK_IN: "attendance.clockIn",
  CLOCK_OUT: "attendance.clockOut",
  BREAK_STARTED: "break.started",
  BREAK_ENDED: "break.ended",
  // Admin-side attendance mutation (edit/approve/reject/delete/manual-add)
  ATTENDANCE_CHANGED: "attendance.changed",
  // Availability status (Available/Busy/Away)
  PRESENCE_CHANGED: "presence.changed",
  // Geofence excursion ("out of ring") — emitted to the org room by name
  EXCURSION_OUT: "geofence_excursion_out",
  EXCURSION_REQUESTED: "geofence_excursion_requested",
  EXCURSION_APPROVED: "geofence_excursion_approved",
  EXCURSION_REJECTED: "geofence_excursion_rejected",
  EXCURSION_RETURNED: "geofence_excursion_returned",
  EXCURSION_EXPIRED: "geofence_excursion_expired",
  // Members / access
  MEMBER_CHANGED: "member.changed",
  MEMBER_ACCESS_UPDATED: "member.access_updated",
  // A new join request arrived (emitted to the org + the routed approvers)
  JOIN_REQUEST_SUBMITTED: "join_request_submitted",
  // CRM — a client record or its activity timeline moved
  CUSTOMER_CHANGED: "customer.changed",
  // A document type changed — including WHO MAY SEE documents filed under it
  DOCUMENT_TYPES_CHANGED: "documents.typesChanged",
  // Calendar: something on MY calendar changed; holidays/weekends changed for the org.
  CALENDAR_CHANGED: "calendar.changed",
  CALENDAR_SETTINGS_CHANGED: "calendar.settingsChanged",
  // Leave — asked for (to whoever is routed about that member) and answered (to them)
  TIME_OFF_REQUESTED: "time_off_requested",
  TIME_OFF_DECIDED: "time_off_decided",
  // Shift-reminder / no-show engine. These are push-first on mobile; on the web
  // they are the only signal the attendance board gets.
  NOSHOW_REMINDER: "attendance_noshow_reminder",
  NOSHOW_ESCALATION: "attendance_noshow_escalation",
  // The escalated shift was answered by a clock-in that arrived late (offline phone).
  NOSHOW_RESOLVED: "attendance_noshow_resolved",
  SHIFT_ESCALATION_RESOLVED: "attendance_shift_escalation_resolved",
  SHIFT_REMINDER: "attendance_shift_reminder",
  SHIFT_ESCALATION: "attendance_shift_escalation",
  // Assets — ids only, to the whole organization, so an open office screen refetches
  ASSET_EXPENSES_CHANGED: "asset.expensesChanged",
  ASSET_CUSTODY_CHANGED: "asset.custodyChanged",
  // Spaces
  SPACE_CHANGED: "space.changed",
  SPACE_ROSTER_CHANGED: "space.rosterChanged",
  // Tracking
  WORKER_LOCATION: "worker.locationUpdated",
  // Future: messaging, calls
  MESSAGE_RECEIVED: "message.received",
  CALL_INCOMING: "call.incoming",
} as const
