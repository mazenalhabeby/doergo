/**
 * Queue Constants
 *
 * Centralized queue names and job types used across all services.
 * Using BullMQ for reliable job processing with exactly-once semantics.
 */

// Queue names
export const QUEUE_NAMES = {
  TASKS: 'tasks',
  ASSETS: 'assets',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
  TRACKING: 'tracking',
  LOCATIONS: 'locations',
  ATTENDANCE: 'attendance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Task queue job types
export const TASK_JOB_TYPES = {
  CREATE: 'task.create',
  UPDATE: 'task.update',
  ASSIGN: 'task.assign',
  DECLINE: 'task.decline',
  UPDATE_STATUS: 'task.updateStatus',
  DELETE: 'task.delete',
  GET_TIMELINE: 'task.getTimeline',
  ADD_COMMENT: 'task.addComment',
  GET_COMMENTS: 'task.getComments',
  ADD_ATTACHMENT: 'task.addAttachment',
  GET_ATTACHMENTS: 'task.getAttachments',
  DELETE_ATTACHMENT: 'task.deleteAttachment',
  GET_PRESIGNED_URL: 'task.getPresignedUrl',
} as const;

export type TaskJobType = (typeof TASK_JOB_TYPES)[keyof typeof TASK_JOB_TYPES];

// Asset queue job types
export const ASSET_JOB_TYPES = {
  // Categories
  CREATE_CATEGORY: 'asset.createCategory',
  UPDATE_CATEGORY: 'asset.updateCategory',
  DELETE_CATEGORY: 'asset.deleteCategory',
  // Types
  CREATE_TYPE: 'asset.createType',
  UPDATE_TYPE: 'asset.updateType',
  DELETE_TYPE: 'asset.deleteType',
  // Assets
  CREATE: 'asset.create',
  UPDATE: 'asset.update',
  DELETE: 'asset.delete',
} as const;

export type AssetJobType = (typeof ASSET_JOB_TYPES)[keyof typeof ASSET_JOB_TYPES];

// Location queue job types (company locations for attendance)
export const LOCATION_JOB_TYPES = {
  CREATE: 'location.create',
  UPDATE: 'location.update',
  DELETE: 'location.delete',
  // Technician assignment operations
  ASSIGN_TECHNICIAN: 'location.assignTechnician',
  UPDATE_ASSIGNMENT: 'location.updateAssignment',
  REMOVE_ASSIGNMENT: 'location.removeAssignment',
} as const;

export type LocationJobType = (typeof LOCATION_JOB_TYPES)[keyof typeof LOCATION_JOB_TYPES];

// Attendance queue job types (clock-in/clock-out)
export const ATTENDANCE_JOB_TYPES = {
  CLOCK_IN: 'attendance.clockIn',
  CLOCK_OUT: 'attendance.clockOut',
  AUTO_CLOCK_OUT: 'attendance.autoClockOut',
} as const;

export type AttendanceJobType = (typeof ATTENDANCE_JOB_TYPES)[keyof typeof ATTENDANCE_JOB_TYPES];

// Report queue job types
export const REPORT_JOB_TYPES = {
  // Create report when completing task
  CREATE: 'report.create',
  // Update report details
  UPDATE: 'report.update',
  // Attachment operations
  ADD_ATTACHMENT: 'report.addAttachment',
  DELETE_ATTACHMENT: 'report.deleteAttachment',
  GET_PRESIGNED_URL: 'report.getPresignedUrl',
  // Parts operations
  ADD_PART: 'report.addPart',
  UPDATE_PART: 'report.updatePart',
  DELETE_PART: 'report.deletePart',
} as const;

export type ReportJobType = (typeof REPORT_JOB_TYPES)[keyof typeof REPORT_JOB_TYPES];

// Notification queue job types
export const NOTIFICATION_JOB_TYPES = {
  SEND_EMAIL: 'notification.sendEmail',
  SEND_PUSH: 'notification.sendPush',
  SEND_SMS: 'notification.sendSms',
} as const;

export type NotificationJobType = (typeof NOTIFICATION_JOB_TYPES)[keyof typeof NOTIFICATION_JOB_TYPES];

// Default job options for different scenarios
export const DEFAULT_JOB_OPTIONS = {
  // For critical operations (task creation, status updates)
  CRITICAL: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
  // For non-critical operations (notifications)
  STANDARD: {
    attempts: 2,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: {
      age: 1800, // Keep for 30 minutes
      count: 500,
    },
    removeOnFail: {
      age: 43200, // Keep failed for 12 hours
    },
  },
  // For time-sensitive operations
  FAST: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: {
      age: 3600,
    },
  },
} as const;
