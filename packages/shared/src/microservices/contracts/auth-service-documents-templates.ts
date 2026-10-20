/** auth-service documents: contract templates — list, write, preview, issue from one. */
import { rpc } from '../contract';
import type { SignatureMode } from '../../documents/types';
import type { ContractTerms, DocumentActor, RequestContext } from './auth-service-documents-types';

export const documentsListTemplates = rpc<{ actor: DocumentActor; includeInactive?: boolean }>(
  'documents_list_templates',
);

export const documentsCreateTemplate = rpc<{
  actor: DocumentActor;
  typeId: string;
  name: string;
  body: string;
  appliesToRoleId?: string | null;
  appliesToPosition?: string | null;
  signatureMode?: SignatureMode;
  offerValidDays?: number | null;
}>('documents_create_template');

export const documentsUpdateTemplate = rpc<{
  actor: DocumentActor;
  id: string;
  patch: Partial<{
    name: string;
    body: string;
    appliesToRoleId: string | null;
    appliesToPosition: string | null;
    signatureMode: SignatureMode;
    offerValidDays: number | null;
    isActive: boolean;
  }>;
}>('documents_update_template');

export const documentsDeactivateTemplate = rpc<{ actor: DocumentActor; id: string }>('documents_deactivate_template');

export const documentsPreviewTemplate = rpc<{
  actor: DocumentActor;
  /** Omit to ask only for the values — the editor does this once per member. */
  body?: string;
  title?: string;
  memberId?: string;
}>('documents_preview_template');

export const documentsIssueFromTemplate = rpc<{
  actor: DocumentActor;
  userId: string;
  templateId?: string;
  /** Terms that are not on the member record. */
  contract?: ContractTerms;
  ctx?: RequestContext;
}>('documents_issue_from_template');
