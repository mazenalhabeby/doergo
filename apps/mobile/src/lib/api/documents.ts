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
  /** Decides whether a waiting document asks for a drawing or an acknowledgement. */
  signatureMode: 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';
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

  /** Record agreement to sign electronically — its own act, before the drawing. */
  consent: async (id: string): Promise<{ consentText: string; consentAt: string }> => {
    const result = await fetchWithAuth<any>(`/documents/${id}/consent`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return result?.data ?? result;
  },

  /**
   * Sign, seal and freeze.
   *
   * `idempotencyKey` is generated ONCE per attempt and reused on every retry:
   * a phone in a plant room drops connections, and a retry must return the
   * existing seal rather than sign a second time.
   */
  sign: async (
    id: string,
    body: { signatureImage: string; idempotencyKey: string },
  ): Promise<{ documentId: string; alreadySigned: boolean }> => {
    const result = await fetchWithAuth<any>(`/documents/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return result?.data ?? result;
  },

  /** "I have read this" — receipt, not agreement. */
  acknowledge: async (id: string): Promise<{ success: boolean }> => {
    const result = await fetchWithAuth<any>(`/documents/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return result?.data ?? result;
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
