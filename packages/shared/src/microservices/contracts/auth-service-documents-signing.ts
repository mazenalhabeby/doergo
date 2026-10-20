/** auth-service documents: the signing chain — who signs, consent, sign, acknowledge, send back. */
import { rpc } from '../contract';
import type { DocumentActor, RequestContext } from './auth-service-documents-types';

export const documentsChain = rpc<{ actor: DocumentActor; documentId: string }>('documents_chain');

export const documentsRouteCandidates = rpc<{ actor: DocumentActor; memberId: string; typeId: string }>(
  'documents_route_candidates',
);

export const documentsSendBack = rpc<{
  actor: DocumentActor;
  documentId: string;
  reason: string;
  ctx?: RequestContext;
}>('documents_send_back');

export const documentsConsent = rpc<{ actor: DocumentActor; documentId: string; ctx?: RequestContext }>(
  'documents_consent',
);

export const documentsSign = rpc<{
  actor: DocumentActor;
  documentId: string;
  /** PNG data URL from the signature pad. */
  signatureImage: string;
  idempotencyKey: string;
  sessionAuthenticatedAt?: string | null;
  ctx?: RequestContext;
}>('documents_sign');

export const documentsAcknowledge = rpc<{
  actor: DocumentActor;
  documentId: string;
  ctx?: RequestContext;
}>('documents_acknowledge');
