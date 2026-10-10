

// ── Session work-log ("what I did today") ──────────────────────────────────
export interface WorkLogAttachment {
  id: string; fileKey: string; fileUrl: string; url?: string; fileName: string;
  fileSize: number; mimeType: string; width?: number | null; height?: number | null; createdAt: string;
}


export interface WorkLogNote {
  id: string; timeEntryId: string; userId: string; body: string; at: string; taskId?: string | null;
  attachments: WorkLogAttachment[]; createdAt: string;
  author?: { id: string; name: string }; // who wrote it (member or manager)
  byManager?: boolean; // true when a manager/admin wrote it, not the session's member
}
