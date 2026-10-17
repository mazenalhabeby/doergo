import { call, type ApiResponse } from "../http-client"
import type { MemberDocumentRow, PendingDocumentsSummary, PendingReviewRow, RequirementRow } from "./types/documents"
import { documentsEndpoints } from "@hbcfield/shared/client"
import { unwrapDocuments } from "./documents-response"

/** Documents themselves: the list, links, uploading, visibility, what is required and waiting, verification, a member supplying their own. Part of `documentsApi`, moved here unchanged. */
export const documentsFilesApi = {
  /** Omit `userId` for your own file. */
  list: async (params?: { userId?: string; typeId?: string; year?: number; search?: string }) => {
    const response = (await call(documentsEndpoints.list, undefined, {
      query: {
        userId: params?.userId,
        typeId: params?.typeId,
        year: params?.year,
        search: params?.search,
      },
    })) as ApiResponse<{ success: boolean; data: MemberDocumentRow[] }>
    return unwrapDocuments(response) ?? []
  },

  /*
    A POST, not a GET, and never called from a list.

    Minting the link IS the "opened" event on the evidence trail. A GET would be
    prefetched by browsers and scanned by link checkers, and the record of who
    read their contract would fill up with robots.
  */
  downloadUrl: async (id: string) => {
    const response = (await call(documentsEndpoints.downloadUrl, { id }, { body: {} })) as ApiResponse<{
      success: boolean
      data: { url: string; fileName: string }
    }>
    return unwrapDocuments(response)
  },

  /** Step 1 of issuing: a link the browser PUTs the file to directly. */
  uploadUrl: async (data: { userId: string; typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = (await call(documentsEndpoints.uploadUrl, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number }
    }>
    return unwrapDocuments(response)
  },

  /** Step 2: the server reads the bytes back, hashes them, and files the row. */
  confirm: async (data: {
    stagingKey: string
    userId: string
    typeId: string
    title: string
    periodYear?: number
    periodMonth?: number
    expiresOn?: string
    /** Stage it: invisible to the member, no notification, until published. */
    asDraft?: boolean
    /** Replace this document: it is superseded and hidden from its member. */
    replacesId?: string
  }) => {
    const response = (await call(documentsEndpoints.create, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: MemberDocumentRow
    }>
    return unwrapDocuments(response)
  },

  /** "Who can see this": hide from the member, and/or limit to roles (null = follow the type). */
  setVisibility: async (data: { documentIds: string[]; hiddenFromMember?: boolean; roleIds?: string[] | null }) => {
    const response = (await call(documentsEndpoints.setVisibility, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { updated: number }
    }>
    return unwrapDocuments<{ updated: number }>(response)
  },

  /** Erase documents for good. `confirmSignaturesLost` is required when any is signed. */
  deleteMany: async (data: { documentIds: string[]; confirmSignaturesLost?: boolean }) => {
    const response = (await call(documentsEndpoints.removeMany, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { deleted: number }
    }>
    return unwrapDocuments<{ deleted: number }>(response)
  },

  /** Org roles a document can be limited to — names only. */
  visibilityRoles: async () => {
    const response = (await call(documentsEndpoints.visibilityRoles)) as ApiResponse<{
      success: boolean
      data: { id: string; name: string; color: string | null }[]
    }>
    return unwrapDocuments<{ id: string; name: string; color: string | null }[]>(response) ?? []
  },

  /** What the organization still expects from you (or, with an id, from them). */
  requirements: async (userId?: string) => {
    const response = (await call(documentsEndpoints.requirements, undefined, { query: { userId } })) as ApiResponse<{
      success: boolean
      data: RequirementRow[]
    }>
    return unwrapDocuments<RequirementRow[]>(response) ?? []
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
    const response = (await call(documentsEndpoints.pending)) as ApiResponse<{
      success: boolean
      data: PendingDocumentsSummary
    }>
    return unwrapDocuments<PendingDocumentsSummary>(response) ?? { toUpload: [], expiring: [], toSign: [] }
  },

  // ── Reviewing what members supplied ──────────────────────────────────────

  awaitingVerification: async () => {
    const response = (await call(documentsEndpoints.awaitingVerification)) as ApiResponse<{
      success: boolean
      data: PendingReviewRow[]
    }>
    return unwrapDocuments<PendingReviewRow[]>(response) ?? []
  },

  /** Accept it. From here it counts — the dispatch gate reads the status. */
  /** Accept it. `expiresOn` ("YYYY-MM-DD") settles the date the reviewer confirmed. */
  verify: async (id: string, expiresOn?: string | null) => {
    const response = (await call(
      documentsEndpoints.verify,
      { id },
      { body: expiresOn ? { expiresOn } : {} },
    )) as ApiResponse<{ success: boolean }>
    return unwrapDocuments(response)
  },

  /** Refuse it. The reason is required, because the member reads it. */
  reject: async (id: string, reason: string) => {
    const response = (await call(documentsEndpoints.reject, { id }, { body: { reason } })) as ApiResponse<{
      success: boolean
    }>
    return unwrapDocuments(response)
  },

  // ── What the member supplies themselves ──────────────────────────────────
  //
  // No userId on either: the member is the token. The server checks the TYPE
  // instead — SUPPLIED only — so this can never file somebody a payslip.

  /** Step 1: somewhere to PUT your own file. */
  ownUploadUrl: async (data: { typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = (await call(documentsEndpoints.ownUploadUrl, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number }
    }>
    return unwrapDocuments<{ url: string; key: string }>(response)
  },

  /**
   * Between the two: what is actually on the picture.
   *
   * Files nothing. The member sees what was read and confirms it, instead of
   * typing a date the server was going to overrule anyway.
   */
  readOwnUpload: async (stagingKey: string) => {
    const response = (await call(documentsEndpoints.readOwnUpload, undefined, {
      body: { stagingKey },
    })) as ApiResponse<{
      success: boolean
      data: {
        source: "MRZ" | "TEXT" | "NOTHING"
        expiresOn: string | null
        fields: { holderName: string | null; documentNumber: string | null } | null
        verdict: "CONSISTENT" | "UNVERIFIED" | "SUSPECT" | null
      }
    }>
    return unwrapDocuments<{
      source: "MRZ" | "TEXT" | "NOTHING"
      expiresOn: string | null
      fields: { holderName: string | null; documentNumber: string | null } | null
      verdict: "CONSISTENT" | "UNVERIFIED" | "SUSPECT" | null
    }>(response)
  },

  /** Step 2: file it for review. It lands PENDING_VERIFICATION, never ISSUED. */
  submitOwn: async (data: { stagingKey: string; typeId: string; title?: string; expiresOn?: string }) => {
    const response = (await call(documentsEndpoints.submitOwn, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: MemberDocumentRow
    }>
    return unwrapDocuments<MemberDocumentRow>(response)
  },

  /**
   * Everything in your file, as a manifest plus one link each.
   *
   * Not an archive: the server never assembles fifty documents in memory. The
   * browser follows the links, which is what the links are for.
   */
  exportMine: async (userId?: string) => {
    const response = (await call(documentsEndpoints.export, undefined, {
      body: userId ? { userId } : {},
    })) as ApiResponse<{
      success: boolean
      data: {
        exportedAt: string
        count: number
        files: {
          title: string
          type: string
          issuedAt: string
          sizeBytes: number
          sha256: string
          signedAt: string | null
          url: string
        }[]
      }
    }>
    return unwrapDocuments(response)
  },
}
