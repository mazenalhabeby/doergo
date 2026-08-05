import { toast } from "sonner"
import i18n from "@/i18n"

/**
 * Premium toast notifications with rich content.
 * Replaces basic toast.success/error with detailed, branded messages.
 *
 * Uses the default i18n instance directly (not the React hook) because these
 * functions run at event time, so they reflect the current language.
 */
export const notify = {
  /** Task moved to a new status */
  taskMoved: (taskTitle: string, newStatus: string) => {
    toast(i18n.t("toast.taskUpdated"), {
      description: `"${taskTitle}" → ${newStatus}`,
    })
  },

  /** Task assigned to sprint */
  taskToSprint: (taskTitle: string, sprintName: string) => {
    toast(i18n.t("toast.addedToSprint"), {
      description: `"${taskTitle}" → ${sprintName}`,
    })
  },

  /** Task assigned to epic */
  taskToEpic: (taskTitle: string, epicName: string) => {
    toast(i18n.t("toast.epicUpdated"), {
      description: `"${taskTitle}" → ${epicName}`,
    })
  },

  /** Task assigned to person */
  taskAssigned: (taskTitle: string, personName: string) => {
    toast(i18n.t("toast.taskAssigned"), {
      description: `"${taskTitle}" → ${personName}`,
    })
  },

  /** Task moved to space */
  taskToSpace: (taskTitle: string, spaceName: string) => {
    toast(i18n.t("toast.movedToSpace"), {
      description: `"${taskTitle}" → ${spaceName}`,
    })
  },

  /** Task created */
  taskCreated: (taskTitle: string) => {
    toast(i18n.t("toast.taskCreated"), {
      description: `"${taskTitle}"`,
    })
  },

  /** Bulk operation */
  bulk: (count: number, action: string) => {
    toast(
      i18n.t(count !== 1 ? "toast.bulkUpdatedMany" : "toast.bulkUpdatedOne", { count }),
      {
        description: action,
      },
    )
  },

  /** Sprint action */
  sprint: (action: string, sprintName: string) => {
    toast(i18n.t("toast.sprintAction", { action }), {
      description: sprintName,
    })
  },

  /** Generic success */
  success: (title: string, description?: string) => {
    toast(title, { description })
  },

  /**
   * Error toast. Leads with the actual reason (e.g. a backend message like
   * "You can only update execution status of tasks assigned to you") so the user
   * sees WHAT went wrong — not a bare "Something went wrong". Falls back to the
   * generic only when no message is provided.
   */
  error: (message?: string, description?: string) => {
    const reason = message?.trim()
    if (reason) {
      toast.error(reason, description ? { description } : undefined)
    } else {
      toast.error(i18n.t("toast.somethingWentWrong"))
    }
  },

  /** Copied to clipboard */
  copied: (what?: string) => {
    toast(what ? i18n.t("toast.copiedWhat", { what }) : i18n.t("toast.copied"), {
      description: i18n.t("toast.savedToClipboard"),
    })
  },
}
