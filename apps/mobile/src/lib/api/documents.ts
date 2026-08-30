import { fetchWithAuth } from './client';
import { buildUrlWithQuery, type Rect } from '@hbcfield/shared/client';

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
  /** The scanner asks for the back as well — ID cards and licences, not passports. */
  twoSided: boolean;
  /** CARD, PASSPORT or PAGE — the frame the scanner draws. */
  scanShape: 'CARD' | 'PASSPORT' | 'PAGE';
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

  /**
   * What the organization still expects FROM the member.
   *
   * The list says what somebody HAS. This says what they have not — a different
   * question, and the one nobody could answer on a phone: the screen showed a
   * tidy file and never mentioned the licence that was never sent.
   */
  requirements: async (): Promise<{
    typeId: string;
    label: string;
    state: 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'MET' | 'EXPIRING' | 'EXPIRED';
    expiresOn: string | null;
    blocksWork: boolean;
  }[]> => {
    const result = await fetchWithAuth<any>('/documents/requirements');
    return Array.isArray(result) ? result : result?.data || [];
  },

  /**
   * Everything personally outstanding, in one request.
   *
   * Separate from `requirements` because the reminder needs BOTH kinds — types
   * to supply and documents awaiting a signature — and two requests for one
   * badge is how a reminder ends up being removed again for being slow.
   */
  pending: async (): Promise<{
    toUpload: { typeId: string; label: string; blocksWork: boolean }[];
    expiring: { typeId: string; label: string; expiresOn: string | null }[];
    toSign: { id: string; title: string }[];
  }> => {
    const result = await fetchWithAuth<any>('/documents/pending');
    const data = result?.data ?? result ?? {};
    return {
      toUpload: data.toUpload ?? [],
      expiring: data.expiring ?? [],
      toSign: data.toSign ?? [],
    };
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
   * Between the two: what is actually on the picture.
   *
   * Files nothing. The member sees what was read and confirms it, instead of
   * typing a date the server was going to overrule anyway.
   */
  readOwnUpload: async (
    stagingKey: string,
    crop?: Rect | null,
    back?: { stagingKey: string; crop?: Rect | null } | null,
  ): Promise<{
    /** MRZ = proved by a check digit. TEXT = a guess off printed text. */
    source: 'MRZ' | 'TEXT' | 'NOTHING';
    expiresOn: string | null;
    fields: { holderName: string | null; documentNumber: string | null } | null;
    verdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
  }> => {
    const result = await fetchWithAuth<any>('/documents/mine/read', {
      method: 'POST',
      body: JSON.stringify({
        stagingKey,
        crop,
        backStagingKey: back?.stagingKey,
        backCrop: back?.crop,
      }),
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
    /** The scanner's frame, so the FILED document is the document. */
    crop?: Rect | null;
    /** The reverse of a card, filed as part of the same document. */
    backStagingKey?: string | null;
    backCrop?: Rect | null;
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
