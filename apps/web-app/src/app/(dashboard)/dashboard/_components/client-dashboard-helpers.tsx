"use client";

import { type Task } from "@/lib/api";
import { type RecentTask } from "@/components/dashboard";

/** ClientDashboard's module-level helpers, moved here unchanged so its sections can read them too. */
/** Map a Task to the compact RecentTask shape used by the dashboard list. */
export function toRecentTask(tk: Task): RecentTask {
  return {
    id: tk.id,
    title: tk.title,
    status: tk.status,
    priority: tk.priority || "MEDIUM",
    dueDate: tk.dueDate ? new Date(tk.dueDate) : undefined,
    location: tk.locationAddress || undefined,
    createdAt: new Date(tk.updatedAt || Date.now()),
  }
}
