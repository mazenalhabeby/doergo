import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

/**
 * The member's own personnel file.
 *
 * Read-only on mobile by design. Issuing, revoking and template work all live
 * on the web, where the person doing them is sitting at a desk with a payroll
 * export open — putting them on a phone would add surface without adding use.
 */

export interface MemberDocument {
  id: string;
  title: string;
  typeId: string;
  typeKey: string;
  typeLabel: string;
  periodYear: number | null;
  periodMonth: number | null;
  status: string;
  sizeBytes: number;
  mimeType: string;
  issuedAt: string;
  expiresOn: string | null;
  unread: boolean;
  needsSignature: boolean;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
}

export interface DocumentType {
  id: string;
  key: string;
  label: string;
  cadence: 'MONTHLY' | 'ANNUAL' | 'ONE_OFF';
  direction: 'ISSUED' | 'SUPPLIED';
  isCredential: boolean;
  isActive: boolean;
}

export const documentsApi = {
  list: async (params?: { typeId?: string; year?: number; search?: string }): Promise<MemberDocument[]> => {
    const result = await fetchWithAuth<any>(
      buildUrlWithQuery('/documents', {
        typeId: params?.typeId,
        year: params?.year,
        search: params?.search,
      }),
    );
    return Array.isArray(result) ? result : result?.data || [];
  },

  listTypes: async (): Promise<DocumentType[]> => {
    const result = await fetchWithAuth<any>('/documents/types');
    return Array.isArray(result) ? result : result?.data || [];
  },

  /*
    POST, not GET — minting the link IS the "opened" event on the evidence
    trail. A GET would be prefetched and the record would fill with robots.
  */
  downloadUrl: async (id: string): Promise<{ url: string; fileName: string }> => {
    const result = await fetchWithAuth<any>(`/documents/${id}/download-url`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return result?.data ?? result;
  },
};
