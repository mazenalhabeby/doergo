/** Legacy role names → the surviving roles, and the socket event names. */
import { Role } from '../enums';

// Legacy role aliases → the two surviving roles (managers are now flagged employees).
export const LegacyRoleMap = {
  PARTNER: Role.ADMIN,
  OFFICE: Role.EMPLOYEE,
  WORKER: Role.EMPLOYEE,
  CLIENT: Role.ADMIN,
  DISPATCHER: Role.EMPLOYEE,
  TECHNICIAN: Role.EMPLOYEE,
} as const;

// Normalize any (incl. legacy) role string to one of the two surviving roles.
// ADMIN/CLIENT/PARTNER → ADMIN; everything else (EMPLOYEE + legacy
// MANAGER/OFFICE/DISPATCHER/TECHNICIAN/WORKER) → EMPLOYEE.
export function normalizeRole(role: string): Role {
  if (role === 'ADMIN' || role === 'CLIENT' || role === 'PARTNER') return Role.ADMIN;
  // External customers are a distinct principal — never collapse to a staff role.
  if (role === 'CUSTOMER') return Role.CUSTOMER;
  return Role.EMPLOYEE;
}

// Socket.IO Events
export const SocketEvents = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_DECLINED: 'task.declined',
  TASK_STATUS_CHANGED: 'task.statusChanged',
  TASK_COMMENT_ADDED: 'task.commentAdded',
  TASK_ATTACHMENT_ADDED: 'task.attachmentAdded',
  TASK_DELETED: 'task.deleted',
  // Worker events
  WORKER_LOCATION_UPDATED: 'worker.locationUpdated',
  // Attendance events
  CLOCK_IN: 'attendance.clockIn',
  CLOCK_OUT: 'attendance.clockOut',
  // Break events
  BREAK_STARTED: 'break.started',
  BREAK_ENDED: 'break.ended',
  // Availability status (Available/Busy/Away) changed
  PRESENCE_CHANGED: 'presence.changed',
  // An admin changed this member's access/role → member should refresh profile
  MEMBER_ACCESS_UPDATED: 'member.access_updated',
  // A space was created, edited, archived or deleted → space lists refresh.
  SPACE_CHANGED: 'space.changed',
  /*
    A document type was defined, changed or retired.

    Org-wide, because changing WHO MAY SEE a type changes what every colleague's
    register contains — and the person who made the change is rarely the person
    looking at the register. Carries an id, not the type: each client re-reads
    through its own scoped endpoints, so nobody is handed a type they may not
    see by the event itself.
  */
  DOCUMENT_TYPES_CHANGED: 'documents.typesChanged',
  // Someone was added to or removed from a space's roster → rosters refresh.
  SPACE_ROSTER_CHANGED: 'space.rosterChanged',
  // Support events
  SUPPORT_MESSAGE: 'support.message', // new message on a ticket
  SUPPORT_TICKET_UPDATED: 'support.ticketUpdated', // status/assignment/SLA change
  SUPPORT_TYPING: 'support.typing', // live-chat typing indicator
  SUPPORT_AGENT_PRESENCE: 'support.agentPresence', // is a human agent online
  // Chat (member-to-member) events
  CHAT_MESSAGE: 'chat.message', // new message in a conversation
  CHAT_CONVERSATION_UPDATED: 'chat.conversationUpdated', // members changed ({ conversationId, removed }) — re-read the list
  CHAT_TYPING: 'chat.typing', // typing indicator in a conversation
  CHAT_BADGE: 'chat.badge', // this person's unread total changed ({ total })
  CHAT_READ: 'chat.read', // a member read a thread ({ conversationId, userId, at })
  CHAT_MESSAGE_CHANGED: 'chat.messageChanged', // a message was edited or removed ({ conversationId, message })
} as const;
