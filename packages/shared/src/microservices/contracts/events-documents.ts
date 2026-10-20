/** Events about the personnel file: documents issued, to sign, sent in, checked; credentials ending. */
import { event } from '../event';
import type { SentNotRead } from './events-types';

export const documentTypesChangedEvent = event<{ organizationId: string; typeId?: string | null }>(
  'document_types_changed',
);

export const credentialExpiringEvent = event<
  {
    documentId: string;
    organizationId: string;
    userId: string;
    userName: string;
    credential: string;
    daysLeft: number;
    expiresOn: string;
    /** Resolved by the producer; falls back to the member alone. */
    recipientIds?: string[];
  } & SentNotRead<'email' | 'title' | 'standing'>
>('credential_expiring');

export const documentIssuedEvent = event<{
  documentId: string;
  userId: string;
  email?: string;
  firstName?: string;
  typeLabel: string;
  title: string;
  needsSignature?: boolean;
}>('document_issued');

export const documentAwaitingSignatureEvent = event<{
  documentId: string;
  userId: string;
  email?: string;
  firstName?: string;
  title: string;
  memberName?: string;
  step?: number;
  totalSteps?: number;
}>('document_awaiting_signature');

export const documentSubmittedEvent = event<{
  documentId: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  typeLabel: string;
  title: string;
  recipientIds?: string[];
}>('document_submitted');

export const documentReviewedEvent = event<
  {
    documentId: string;
    userId: string;
    firstName?: string;
    typeLabel: string;
    accepted: boolean;
    reason?: string | null;
  } & SentNotRead<'email'>
>('document_reviewed');
