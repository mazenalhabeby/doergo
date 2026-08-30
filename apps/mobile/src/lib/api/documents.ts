import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

/**
 * The member's own personnel file.
 *
 * Read-only on mobile EXCEPT for what the member supplies themselves. Issuing,
 * revoking and template work live on the web, where the person doing them is at
 * a desk with a payroll export open; putting those on a phone would add surface
 * without adding use.
 *
 * Supplying is the opposite case. A driving licence is photographed, and the
 * camera is here — asking somebody to email a photo to the office so it can be
 * uploaded from a desk is how this data goes stale.
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
  /** Why a reviewer refused something the member supplied. */
  rejectionReason?: string | null;
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
  description?: string | null;
  /** A date is demanded at upload time when this is set. */
  hasExpiry: boolean;
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

  // ── What the member supplies ─────────────────────────────────────────────

  /** Step 1: somewhere to PUT the photograph. No user id — the member is the token. */
  ownUploadUrl: async (data: {
    typeId: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ url: string; key: string }> => {
    const result = await fetchWithAuth<any>('/documents/mine/upload-url', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result?.data ?? result;
  },

  /**
   * Step 2: file it for review.
   *
   * It lands PENDING_VERIFICATION. A photograph of a card somebody says is
   * theirs is a claim, not a record, and the dispatch gate reads status — so
   * this cannot clear a certificate requirement until a person approves it.
   */
  submitOwn: async (data: {
    stagingKey: string;
    typeId: string;
    title?: string;
    expiresOn?: string;
    /** Whatever a scanner read, raw. Checked on the server, never here. */
    mrzText?: string;
  }): Promise<MemberDocument> => {
    const result = await fetchWithAuth<any>('/documents/mine', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result?.data ?? result;
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
