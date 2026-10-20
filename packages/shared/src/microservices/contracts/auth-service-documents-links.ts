/** auth-service documents: the client's signing link — open, file, sign, re-send. */
import { rpc } from '../contract';
import type { RequestContext } from './auth-service-documents-types';

export const documentsLinkOpen = rpc<{ token: string }>('documents_link_open');

export const documentsLinkFile = rpc<{ token: string; signerId: string }>('documents_link_file');

export const documentsLinkSign = rpc<{
  token: string;
  signerIds: string[];
  signatureImage: string;
  name: string;
  role?: string | null;
  idempotencyKey: string;
  ctx?: RequestContext;
}>('documents_link_sign');

export const documentsLinkReissue = rpc<{ email: string }>('documents_link_reissue');
