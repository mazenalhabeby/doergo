/** Assets and the service reports written about them. */
import { AssetStatus, ReportAttachmentType } from '../enums';
import type { BaseEntity } from './api-user';

// Asset Category interface (organization-defined)
export interface AssetCategory extends BaseEntity {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  organizationId: string;
}

// Asset Type interface (within a category)
export interface AssetType extends BaseEntity {
  name: string;
  description?: string;
  categoryId: string;
}

// Asset interface (the actual equipment)
export interface Asset extends BaseEntity {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status: AssetStatus;
  installDate?: Date;
  warrantyExpiry?: Date;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  organizationId: string;
  categoryId?: string;
  typeId?: string;
  // Populated relations
  category?: AssetCategory;
  type?: AssetType;
}

// Asset with maintenance history (using ServiceReports)
export interface AssetWithHistory extends Asset {
  serviceReports: ServiceReportSummary[];
}

// Service Report Summary (for asset maintenance history list)
export interface ServiceReportSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  summary: string;
  workDuration: number; // in seconds
  completedAt: Date;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  partsTotal?: number; // Total cost of parts used
  attachmentCount: number;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
}

// Service Report interface (full report)
export interface ServiceReport extends BaseEntity {
  taskId: string;
  assetId?: string;
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: Date;
  completedById: string;
  organizationId: string;
  // Populated relations
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: ReportAttachment[];
  partsUsed?: PartUsed[];
}

// Report Attachment interface
export interface ReportAttachment extends BaseEntity {
  reportId: string;
  type: ReportAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  caption?: string;
}

// Part Used interface
export interface PartUsed extends BaseEntity {
  reportId: string;
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

// Complete Task DTO (for creating report when completing task)
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
