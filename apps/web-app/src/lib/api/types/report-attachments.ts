

// ============================================
// SERVICE REPORTS TYPES & API
// ============================================

export type ReportAttachmentType = 'BEFORE' | 'AFTER';


export interface ReportAttachment {
  id: string;
  reportId: string;
  type: ReportAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  caption: string | null;
  createdAt: string;
}
