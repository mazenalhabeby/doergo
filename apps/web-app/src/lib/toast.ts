import { toast } from "sonner"

/**
 * Premium toast notifications with rich content.
 * Replaces basic toast.success/error with detailed, branded messages.
 */
export const notify = {
  /** Task moved to a new status */
  taskMoved: (taskTitle: string, newStatus: string) => {
    toast(`Task updated`, {
      description: `"${taskTitle}" → ${newStatus}`,
    })
  },

  /** Task assigned to sprint */
  taskToSprint: (taskTitle: string, sprintName: string) => {
    toast(`Added to sprint`, {
      description: `"${taskTitle}" → ${sprintName}`,
    })
  },

  /** Task assigned to epic */
  taskToEpic: (taskTitle: string, epicName: string) => {
    toast(`Epic updated`, {
      description: `"${taskTitle}" → ${epicName}`,
    })
  },

  /** Task assigned to person */
  taskAssigned: (taskTitle: string, personName: string) => {
    toast(`Task assigned`, {
      description: `"${taskTitle}" → ${personName}`,
    })
  },

  /** Task moved to space */
  taskToSpace: (taskTitle: string, spaceName: string) => {
    toast(`Moved to space`, {
      description: `"${taskTitle}" → ${spaceName}`,
    })
  },

  /** Task created */
  taskCreated: (taskTitle: string) => {
    toast(`Task created`, {
      description: `"${taskTitle}"`,
    })
  },

  /** Bulk operation */
  bulk: (count: number, action: string) => {
    toast(`${count} task${count !== 1 ? "s" : ""} updated`, {
      description: action,
    })
  },

  /** Sprint action */
  sprint: (action: string, sprintName: string) => {
    toast(`Sprint ${action}`, {
      description: sprintName,
    })
  },

  /** Generic success */
  success: (title: string, description?: string) => {
    toast(title, { description })
  },

  /** Error */
  error: (message: string) => {
    toast.error("Something went wrong", {
      description: message,
    })
  },

  /** Copied to clipboard */
  copied: (what?: string) => {
    toast(`Copied${what ? ` ${what}` : ""}`, {
      description: "Saved to clipboard",
    })
  },
}
