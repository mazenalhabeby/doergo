import type { WorkLogAttachment } from './worklog';

/**
 * An attachment as the CLIENT sends it, before the server stores it.
 *
 * `id` and `createdAt` belong to the stored row, so a payload cannot be typed
 * with them — the shape going up and the shape coming back are not the same
 * shape, which is exactly what `any[]` on both sides was hiding.
 */
export type WorkLogAttachmentInput = Omit<WorkLogAttachment, 'id' | 'createdAt'>;


// ── Shift Issues (blockers) ──────────────────────────────────────────────────
export type ShiftIssueStatus = "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELED"

export type ShiftIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "URGENT"


export interface ShiftIssueEvent {
  id: string; type: string; actorId?: string | null; actorName?: string; body?: string | null;
  metadata?: Record<string, unknown>; attachments?: WorkLogAttachment[]; at: string
}

export interface ShiftIssue {
  id: string; organizationId: string; title: string; description?: string | null;
  severity: ShiftIssueSeverity; status: ShiftIssueStatus;
  reportedById: string; reporterName?: string; assignedToId?: string | null; assigneeName?: string | null;
  spaceId?: string | null; timeEntryId?: string | null;
  resolutionNote?: string | null; createdAt: string; updatedAt: string;
  eventCount?: number; thread?: ShiftIssueEvent[]
}
