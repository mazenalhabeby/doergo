import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { BrowseLevel, ComplianceRow, ContractTemplateRow, DocumentTypeRow, DraftDocumentRow, IssuedRegister, MatchCandidateRow, MemberDocumentRow, PendingDocumentsSummary, PendingReviewRow, RequirementRow, TemplatePreview } from './types/documents';
import { documentsEndpoints } from '@hbcfield/shared/client';

/**
 * Unwrap a documents response.
 *
 * These routes return the payload BARE — `[…]` or `{…}` — not wrapped in
 * `{ success, data }` like most of this file. Reading `response.data.data` gave
 * `undefined`, `|| []` turned that into an empty list, and every document
 * screen rendered "Nothing here yet" against a database with 184 documents in
 * it. Nothing errored; the data was simply thrown away on arrival.
 *
 * One helper rather than the same guard at twenty call sites: whichever shape
 * arrives, the caller gets the payload.
 */
export function unwrapDocuments<T>(response: ApiResponse<unknown>): T | undefined {
  if (response.error) throw apiError(response);
  const body = response.data as any;
  if (body === null || body === undefined) return undefined;
  // A wrapped payload carries `data`; a bare array or object is itself.
  if (!Array.isArray(body) && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}


export const documentsApi = {
  listTypes: async (includeInactive = false) => {
    const response = await call(documentsEndpoints.types, undefined, { query: { includeInactive: includeInactive || undefined } }) as ApiResponse<{ success: boolean; data: DocumentTypeRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  createType: async (data: Partial<DocumentTypeRow> & { key: string; label: string }) => {
    const response = await call(documentsEndpoints.createType, undefined, { body: data }) as ApiResponse<{ success: boolean; data: DocumentTypeRow }>;
    return unwrapDocuments<any>(response);
  },

  updateType: async (id: string, data: Partial<DocumentTypeRow>) => {
    const response = await call(documentsEndpoints.updateType, { id }, { body: data }) as ApiResponse<{ success: boolean; data: DocumentTypeRow }>;
    return unwrapDocuments<any>(response);
  },

  deactivateType: async (id: string) => {
    const response = await call(documentsEndpoints.deactivateType, { id }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  /** Omit `userId` for your own file. */
  list: async (params?: { userId?: string; typeId?: string; year?: number; search?: string }) => {
    const response = await call(documentsEndpoints.list, undefined, { query: {
        userId: params?.userId,
        typeId: params?.typeId,
        year: params?.year,
        search: params?.search,
      } }) as ApiResponse<{ success: boolean; data: MemberDocumentRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  /*
    A POST, not a GET, and never called from a list.

    Minting the link IS the "opened" event on the evidence trail. A GET would be
    prefetched by browsers and scanned by link checkers, and the record of who
    read their contract would fill up with robots.
  */
  downloadUrl: async (id: string) => {
    const response = await call(documentsEndpoints.downloadUrl, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { url: string; fileName: string } }>;
    return unwrapDocuments<any>(response);
  },

  /** Step 1 of issuing: a link the browser PUTs the file to directly. */
  uploadUrl: async (data: { userId: string; typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = await call(documentsEndpoints.uploadUrl, undefined, { body: data }) as ApiResponse<{
      success: boolean;
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number };
    }>;
    return unwrapDocuments<any>(response);
  },

  /** Step 2: the server reads the bytes back, hashes them, and files the row. */
  confirm: async (data: {
    stagingKey: string;
    userId: string;
    typeId: string;
    title: string;
    periodYear?: number;
    periodMonth?: number;
    expiresOn?: string;
    /** Stage it: invisible to the member, no notification, until published. */
    asDraft?: boolean;
    /** Replace this document: it is superseded and hidden from its member. */
    replacesId?: string;
  }) => {
    const response = await call(documentsEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: MemberDocumentRow }>;
    return unwrapDocuments<any>(response);
  },

  /** "Who can see this": hide from the member, and/or limit to roles (null = follow the type). */
  setVisibility: async (data: { documentIds: string[]; hiddenFromMember?: boolean; roleIds?: string[] | null }) => {
    const response = await call(documentsEndpoints.setVisibility, undefined, { body: data }) as ApiResponse<{ success: boolean; data: { updated: number } }>;
    return unwrapDocuments<{ updated: number }>(response)
  },

  /** Erase documents for good. `confirmSignaturesLost` is required when any is signed. */
  deleteMany: async (data: { documentIds: string[]; confirmSignaturesLost?: boolean }) => {
    const response = await call(documentsEndpoints.removeMany, undefined, { body: data }) as ApiResponse<{ success: boolean; data: { deleted: number } }>;
    return unwrapDocuments<{ deleted: number }>(response)
  },

  /** Org roles a document can be limited to — names only. */
  visibilityRoles: async () => {
    const response = await call(documentsEndpoints.visibilityRoles) as ApiResponse<{ success: boolean; data: { id: string; name: string; color: string | null }[] }>;
    return unwrapDocuments<{ id: string; name: string; color: string | null }[]>(response) ?? []
  },

  /** What the organization still expects from you (or, with an id, from them). */
  requirements: async (userId?: string) => {
    const response = await call(documentsEndpoints.requirements, undefined, { query: { userId } }) as ApiResponse<{ success: boolean; data: RequirementRow[] }>;
    return unwrapDocuments<RequirementRow[]>(response) ?? [];
  },

  /**
   * Everything personally outstanding, in one request.
   *
   * Separate from `requirements` because a reminder needs BOTH kinds — types to
   * supply and documents awaiting a signature — and two requests for one badge
   * is how a reminder ends up removed again for being slow. Self only: it takes
   * no userId, because a summary endpoint that accepts somebody else's is a
   * convenient way to find out who is behind on what.
   */
  pending: async () => {
    const response = await call(documentsEndpoints.pending) as ApiResponse<{ success: boolean; data: PendingDocumentsSummary }>;
    return (
      unwrapDocuments<PendingDocumentsSummary>(response) ?? { toUpload: [], expiring: [], toSign: [] }
    );
  },

  // ── Reviewing what members supplied ──────────────────────────────────────

  awaitingVerification: async () => {
    const response = await call(documentsEndpoints.awaitingVerification) as ApiResponse<{ success: boolean; data: PendingReviewRow[] }>;
    return unwrapDocuments<PendingReviewRow[]>(response) ?? [];
  },

  /** Accept it. From here it counts — the dispatch gate reads the status. */
  /** Accept it. `expiresOn` ("YYYY-MM-DD") settles the date the reviewer confirmed. */
  verify: async (id: string, expiresOn?: string | null) => {
    const response = await call(documentsEndpoints.verify, { id }, { body: expiresOn ? { expiresOn } : {} }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  /** Refuse it. The reason is required, because the member reads it. */
  reject: async (id: string, reason: string) => {
    const response = await call(documentsEndpoints.reject, { id }, { body: { reason } }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  // ── What the member supplies themselves ──────────────────────────────────
  //
  // No userId on either: the member is the token. The server checks the TYPE
  // instead — SUPPLIED only — so this can never file somebody a payslip.

  /** Step 1: somewhere to PUT your own file. */
  ownUploadUrl: async (data: { typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = await call(documentsEndpoints.ownUploadUrl, undefined, { body: data }) as ApiResponse<{
      success: boolean;
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number };
    }>;
    return unwrapDocuments<{ url: string; key: string }>(response);
  },

  /**
   * Between the two: what is actually on the picture.
   *
   * Files nothing. The member sees what was read and confirms it, instead of
   * typing a date the server was going to overrule anyway.
   */
  readOwnUpload: async (stagingKey: string) => {
    const response = await call(documentsEndpoints.readOwnUpload, undefined, { body: { stagingKey } }) as ApiResponse<{
      success: boolean;
      data: {
        source: 'MRZ' | 'TEXT' | 'NOTHING';
        expiresOn: string | null;
        fields: { holderName: string | null; documentNumber: string | null } | null;
        verdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
      };
    }>;
    return unwrapDocuments<{
      source: 'MRZ' | 'TEXT' | 'NOTHING';
      expiresOn: string | null;
      fields: { holderName: string | null; documentNumber: string | null } | null;
      verdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
    }>(response);
  },

  /** Step 2: file it for review. It lands PENDING_VERIFICATION, never ISSUED. */
  submitOwn: async (data: {
    stagingKey: string;
    typeId: string;
    title?: string;
    expiresOn?: string;
  }) => {
    const response = await call(documentsEndpoints.submitOwn, undefined, { body: data }) as ApiResponse<{ success: boolean; data: MemberDocumentRow }>;
    return unwrapDocuments<MemberDocumentRow>(response);
  },

  /**
   * Everything in your file, as a manifest plus one link each.
   *
   * Not an archive: the server never assembles fifty documents in memory. The
   * browser follows the links, which is what the links are for.
   */
  exportMine: async (userId?: string) => {
    const response = await call(documentsEndpoints.export, undefined, { body: userId ? { userId } : {} }) as ApiResponse<{
      success: boolean;
      data: {
        exportedAt: string;
        count: number;
        files: {
          title: string; type: string; issuedAt: string; sizeBytes: number;
          sha256: string; signedAt: string | null; url: string;
        }[];
      };
    }>;
    return unwrapDocuments<any>(response);
  },

  // ── Credentials ──────────────────────────────────────────────────────────

  // ── The filing cabinet ───────────────────────────────────────────────────

  /**
   * One level of folders, never the whole tree.
   *
   * Each call returns just the children of the path given, with counts, so the
   * cost of drawing a folder does not grow with the size of the archive.
   */
  browse: async (params: {
    groupBy?: "type" | "member" | "year"
    typeId?: string
    userId?: string
    year?: number
    undated?: boolean
  }) => {
    const response = await call(documentsEndpoints.browse, {
        groupBy: params.groupBy,
        typeId: params.typeId,
        userId: params.userId,
        year: params.year,
        undated: params.undated ? true : undefined,
      }) as ApiResponse<{ success: boolean; data: BrowseLevel }>
    return (
      unwrapDocuments<BrowseLevel>(response) ?? {
        groupBy: params.groupBy ?? "type",
        level: "type" as const,
        folders: [],
        documents: [],
      }
    )
  },

  // ── The register ─────────────────────────────────────────────────────────

  /**
   * Everything the organization has issued, by state.
   *
   * Carries no urls: a link is minted only by opening a document, and that mint
   * is what records the delivery evidence.
   */
  listIssued: async (params?: {
    tab?: "awaiting" | "unopened" | "signed" | "all"
    typeId?: string
    userId?: string
    year?: number
    search?: string
    page?: number
    limit?: number
  }) => {
    const response = await call(documentsEndpoints.sent, undefined, { query: {
        tab: params?.tab,
        typeId: params?.typeId,
        userId: params?.userId,
        year: params?.year,
        search: params?.search,
        page: params?.page,
        limit: params?.limit,
      } }) as ApiResponse<{ success: boolean; data: IssuedRegister }>
    // An empty register rather than undefined: the screen renders the same way
    // for "nothing issued" and for a response the unwrapper did not recognise,
    // and neither is an error worth showing an admin.
    return (
      unwrapDocuments<IssuedRegister>(response) ?? {
        rows: [],
        page: 1,
        limit: 25,
        total: 0,
        counts: { awaiting: 0, unopened: 0, signed: 0, all: 0 },
      }
    )
  },

  /** Validity and dates only — never the certificate itself. */
  compliance: async () => {
    const response = await call(documentsEndpoints.compliance) as ApiResponse<{ success: boolean; data: ComplianceRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  // ── Signing ──────────────────────────────────────────────────────────────

  /** Record agreement to sign electronically. Its own act, before the drawing. */
  consent: async (id: string) => {
    const response = await call(documentsEndpoints.consent, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { consentText: string; consentAt: string } }>;
    return unwrapDocuments<any>(response);
  },

  /**
   * Sign, seal and freeze.
   *
   * The idempotency key is made ONCE per attempt and reused on every retry, so
   * a dropped connection returns the existing seal instead of signing twice.
   */
  sign: async (id: string, body: { signatureImage: string; idempotencyKey: string }) => {
    const response = await call(documentsEndpoints.sign, { id }, { body: body }) as ApiResponse<{ success: boolean; data: { documentId: string; alreadySigned: boolean } }>;
    return unwrapDocuments<any>(response);
  },

  /** "I have read this" — receipt, not agreement. */
  acknowledge: async (id: string) => {
    const response = await call(documentsEndpoints.acknowledge, { id }, { body: {} }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  // ── Templates ────────────────────────────────────────────────────────────

  listTemplates: async (includeInactive = false) => {
    const response = await call(documentsEndpoints.templates, undefined, { query: { includeInactive: includeInactive || undefined } }) as ApiResponse<{ success: boolean; data: ContractTemplateRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  createTemplate: async (data: {
    typeId: string; name: string; body: string;
    appliesToRoleId?: string; appliesToPosition?: string;
    signatureMode?: string; offerValidDays?: number;
  }) => {
    const response = await call(documentsEndpoints.createTemplate, undefined, { body: data }) as ApiResponse<{ success: boolean; data: ContractTemplateRow }>;
    return unwrapDocuments<any>(response);
  },

  /**
   * The draft laid out as the PDF a member would receive.
   *
   * Returns base64 rather than a URL because nothing is stored — there is no
   * object to presign, and a preview that had to be written to storage first
   * would leave a trail of dead files behind every edit.
   */
  previewTemplate: async (data: { body?: string; title?: string; memberId?: string }) => {
    const response = await call(documentsEndpoints.previewTemplate, undefined, { body: data }) as ApiResponse<{ success: boolean; data: TemplatePreview }>;
    return unwrapDocuments<TemplatePreview>(response);
  },

  updateTemplate: async (id: string, data: Record<string, unknown>) => {
    const response = await call(documentsEndpoints.updateTemplate, { id }, { body: data }) as ApiResponse<{ success: boolean; data: ContractTemplateRow }>;
    return unwrapDocuments<any>(response);
  },

  deactivateTemplate: async (id: string) => {
    const response = await call(documentsEndpoints.deactivateTemplate, { id }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  // ── Payroll day ──────────────────────────────────────────────────────────

  /** The members a batch can be matched against. Matching runs in the browser. */
  matchCandidates: async () => {
    const response = await call(documentsEndpoints.matchCandidates) as ApiResponse<{ success: boolean; data: MatchCandidateRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  listDrafts: async () => {
    const response = await call(documentsEndpoints.drafts) as ApiResponse<{ success: boolean; data: DraftDocumentRow[] }>;
    return unwrapDocuments<any[]>(response) ?? [];
  },

  /** All or nothing — one unresolved row blocks the whole batch. */
  publishBatch: async (
    documentIds: string[],
    signerChoices?: Array<{
      documentId: string
      choices: Array<{
        order: number
        userId?: string | null
        customerId?: string | null
        /** Typed in for a counterparty nobody has on file. */
        email?: string | null
        name?: string | null
      }>
    }>,
  ) => {
    const response = await call(documentsEndpoints.publish, undefined, { body: { documentIds, ...(signerChoices?.length ? { signerChoices } : {}) } }) as ApiResponse<{ success: boolean; data: { published: number } }>
    return unwrapDocuments<{ published: number }>(response)
  },

  discardDraft: async (id: string) => {
    const response = await call(documentsEndpoints.discardDraft, { id }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },

  /** Only ever your own, and only what you supplied. */
  remove: async (id: string) => {
    const response = await call(documentsEndpoints.remove, { id }) as ApiResponse<{ success: boolean }>;
    return unwrapDocuments<any>(response);
  },
};
