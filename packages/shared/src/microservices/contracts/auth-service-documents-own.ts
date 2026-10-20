/** auth-service documents: what a member hands in themselves. */
import { rpc } from '../contract';
import type { Rect } from '../../documents/frame-crop';
import type { DocumentActor, SubmitOwnDocumentInput } from './auth-service-documents-types';

export const documentsPresignOwnUpload = rpc<{
  actor: DocumentActor;
  typeId: string;
  mimeType: string;
  sizeBytes: number;
}>('documents_presign_own_upload');

export const documentsReadOwnUpload = rpc<{
  actor: DocumentActor;
  stagingKey: string;
  crop?: Rect | null;
  /** The reverse, for a card that carries its zone there. */
  backStagingKey?: string | null;
  backCrop?: Rect | null;
}>('documents_read_own_upload');

export const documentsSubmitOwn = rpc<SubmitOwnDocumentInput>('documents_submit_own');

export const documentsDeleteOwn = rpc<{ actor: DocumentActor; documentId: string }>('documents_delete_own');
