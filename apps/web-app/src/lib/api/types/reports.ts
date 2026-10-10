import type { ReportAttachment } from './report-attachments';

export interface PartUsed {
  id: string;
  reportId: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
}


export interface ServiceReport {
  id: string;
  taskId: string;
  assetId: string | null;
  summary: string;
  workPerformed: string | null;
  workDuration: number; // in seconds
  technicianSignature: string | null;
  customerSignature: string | null;
  customerName: string | null;
  completedAt: string;
  completedById: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  attachments?: ReportAttachment[];
  partsUsed?: PartUsed[];
}


export interface ServiceReportSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  summary: string;
  workDuration: number; // in seconds
  completedAt: string;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  /** Lines of parts used — not the sum of their quantities. */
  partsCount?: number;
  partsTotal: number; // Total cost of parts used
  attachmentCount: number;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
}


export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: {
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
  }[];
}


export interface UpdateReportInput {
  summary?: string;
  workPerformed?: string;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
}
