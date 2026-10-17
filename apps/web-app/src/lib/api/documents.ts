import { call, type ApiResponse } from "../http-client"
import { apiError } from "../server-error"
import type {
  BrowseLevel,
  ComplianceRow,
  ContractTemplateRow,
  DocumentTypeRow,
  DraftDocumentRow,
  IssuedRegister,
  MatchCandidateRow,
  MemberDocumentRow,
  PendingDocumentsSummary,
  PendingReviewRow,
  RequirementRow,
  TemplatePreview,
} from "./types/documents"
import { documentsEndpoints } from "@hbcfield/shared/client"
import { unwrapDocuments } from "./documents-response"
import { documentsFilesApi } from "./documents-files"
import { documentsRegistersApi } from "./documents-registers"
export { unwrapDocuments } from "./documents-response"

export const documentsApi = {
  listTypes: async (includeInactive = false) => {
    const response = (await call(documentsEndpoints.types, undefined, {
      query: { includeInactive: includeInactive || undefined },
    })) as ApiResponse<{ success: boolean; data: DocumentTypeRow[] }>
    return unwrapDocuments(response) ?? []
  },

  createType: async (data: Partial<DocumentTypeRow> & { key: string; label: string }) => {
    const response = (await call(documentsEndpoints.createType, undefined, { body: data })) as ApiResponse<{
      success: boolean
      data: DocumentTypeRow
    }>
    return unwrapDocuments(response)
  },

  updateType: async (id: string, data: Partial<DocumentTypeRow>) => {
    const response = (await call(documentsEndpoints.updateType, { id }, { body: data })) as ApiResponse<{
      success: boolean
      data: DocumentTypeRow
    }>
    return unwrapDocuments(response)
  },

  deactivateType: async (id: string) => {
    const response = (await call(documentsEndpoints.deactivateType, { id })) as ApiResponse<{ success: boolean }>
    return unwrapDocuments(response)
  },
  ...documentsFilesApi,
  ...documentsRegistersApi,
}
