import { call, type ApiResponse } from '../http-client';
import type {
  BrowseLevel,
  ComplianceRow,
  ContractTemplateRow,
  DraftDocumentRow,
  IssuedRegister,
  MatchCandidateRow,
  TemplatePreview,
} from './types/documents';
import { documentsEndpoints } from '@hbcfield/shared/client';
import { unwrapDocuments } from './documents-response';

/** The registers, the credential board, signing, templates and drafts. Part of `documentsApi`, moved here unchanged. */
export const documentsRegistersApi = {
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
