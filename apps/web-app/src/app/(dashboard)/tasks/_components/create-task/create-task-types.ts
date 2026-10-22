/** The New Task dialog's props and the assignee shape. */

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSprintId?: string | null
  defaultSpaceId?: string | null
  /** Link the new task to a CRM customer (locks the space to the customer's). */
  defaultCustomerId?: string | null
  /** Opened from the calendar: the day (and hour, when not midnight) that was tapped. */
  defaultDueDate?: Date | null
}

// ---------------------------------------------------------------------------
// CreateTaskDialog
// ---------------------------------------------------------------------------
/**
 * What the assignee picker actually needs from a person.
 *
 * Both sources supply it — a space roster entry and an organization member —
 * and naming the shape keeps that union honest rather than casting the narrower
 * one to the wider.
 */
export type AssigneeOption = {
  id: string
  firstName?: string
  lastName?: string
  enabledModules?: unknown
}
