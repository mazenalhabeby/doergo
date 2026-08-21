/**
 * Payloads the server sends over the socket.
 *
 * Shared because more than one listener reads the same events, and each one
 * having its own idea of the shape is how they drift apart. Every field is
 * optional: these come from several services and genuinely differ per event.
 */
export interface TaskEventPayload {
  id?: string
  taskId?: string
  title?: string
  newStatus?: string
  assignedToId?: string
  workerId?: string
  userId?: string
  task?: { id?: string; title?: string; assignedToId?: string } | null
  comment?: { content?: string } | null
  attachment?: { fileName?: string } | null
}
