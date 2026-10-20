/** auth-service documents: the catalogue of document types, and who may see them. */
import { rpc } from '../contract';
import type { DocumentCadence, DocumentDirection, SignatureMode } from '../../documents/types';
import type { DocumentActor, RequestContext } from './auth-service-documents-types';

export const documentsListTypes = rpc<{
  organizationId: string;
  includeInactive?: boolean;
  /**
   * The caller, for type visibility.
   *
   * ⚠️ `manage` skips the restriction: configuring types requires seeing all of
   * them, and it is `canManageDocumentTemplates` that grants it — you cannot
   * set who may see a type from a screen that hides it from you.
   */
  roleId?: string | null;
  isAdmin?: boolean;
  manage?: boolean;
  /** For the self-exemptions in `visibleTypeSelfWhere`. */
  userId?: string | null;
}>('documents_list_types');

export const documentsCreateType = rpc<{
  actor: DocumentActor;
  key: string;
  label: string;
  description?: string | null;
  cadence?: DocumentCadence;
  direction?: DocumentDirection;
  retentionMonths?: number | null;
  signatureMode?: SignatureMode;
  isCredential?: boolean;
  hasExpiry?: boolean;
  requiredForWorkflowIds?: string[];
  requiredFromAll?: boolean;
  requiredFromRoleIds?: string[];
  /** Roles that may SEE documents of this type. Empty = no restriction. */
  visibleToRoleIds?: string[];
  twoSided?: boolean;
  /** Sheets of paper rather than a card — refused together with twoSided. */
  multiPage?: boolean;
  scanShape?: string;
  position?: number;
  /**
   * The signing route: an ordered list of {role}, or null for one signature.
   *
   * ⚠️ This was missing here while `updateType` accepted it, so a type created
   * WITH a signing route was created without one — silently, since every other
   * field saved. The only way to get a route onto a new type was to create it,
   * reopen it, and set the route a second time.
   */
  signerRoute?: unknown;
}>('documents_create_type');

export const documentsUpdateType = rpc<{
  actor: DocumentActor;
  id: string;
  patch: Partial<{
    label: string;
    description: string | null;
    retentionMonths: number | null;
    signatureMode: SignatureMode;
    isCredential: boolean;
    hasExpiry: boolean;
    requiredForWorkflowIds: string[];
    requiredFromAll: boolean;
    requiredFromRoleIds: string[];
    /** Roles that may SEE documents of this type. Empty = no restriction. */
    visibleToRoleIds: string[];
    twoSided: boolean;
    /** Sheets of paper rather than a card — refused together with twoSided. */
    multiPage: boolean;
    scanShape: string;
    isActive: boolean;
    position: number;
    /** Ordered signer roles, or null to go back to a single signature. */
    signerRoute: unknown;
  }>;
}>('documents_update_type');

export const documentsDeactivateType = rpc<{ actor: DocumentActor; id: string }>('documents_deactivate_type');

export const documentsSetVisibility = rpc<{
  actor: DocumentActor;
  documentIds: string[];
  hiddenFromMember?: boolean;
  roleIds?: string[] | null;
  ctx?: RequestContext;
}>('documents_set_visibility');
