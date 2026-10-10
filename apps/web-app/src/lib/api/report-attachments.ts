import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { ReportAttachment } from './types/report-attachments';
import { reportsEndpoints } from '@hbcfield/shared/client';

// Report Attachments API (presigned URL upload flow)
export const reportAttachmentsApi = {
  // Get presigned URL for uploading
  getPresignedUrl: async (reportId: string, fileName: string, fileType: string) => {
    const response = await call(reportsEndpoints.attachmentPresign, { id: reportId }, { body: { fileName, fileType } }) as ApiResponse<{
      success: boolean;
      data: { uploadUrl: string; fileKey?: string; fileUrl: string };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Confirm upload after S3 upload completes
  confirmUpload: async (
    reportId: string,
    data: {
      type: 'BEFORE' | 'AFTER';
      fileName: string;
      fileKey?: string;
      fileUrl?: string;
      fileType?: string;
      fileSize: number;
      caption?: string;
    }
  ) => {
    const response = await call(reportsEndpoints.attachmentConfirm, { id: reportId }, { body: data }) as ApiResponse<{ success: boolean; data: ReportAttachment }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete an attachment
  delete: async (reportId: string, attachmentId: string) => {
    const response = await call(reportsEndpoints.removeAttachment, { id: reportId, attachmentId }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};
