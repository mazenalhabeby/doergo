/**
 * Queue Constants
 *
 * Centralized queue names and job types used across all services.
 * Using BullMQ for reliable job processing with exactly-once semantics.
 */

// Queue names
export const QUEUE_NAMES = {
  TASKS: 'tasks',
  NOTIFICATIONS: 'notifications',
  TRACKING: 'tracking',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Task queue job types
export const TASK_JOB_TYPES = {
  CREATE: 'task.create',
  UPDATE: 'task.update',
  ASSIGN: 'task.assign',
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
