import { BadRequestException } from '@nestjs/common';
import {
  parseClientLocale,
  CLIENT_LOCALE_INVALID_MESSAGE,
  parseCurrency,
  CURRENCY_INVALID_MESSAGE,
} from '@hbcfield/shared';

interface CustomerDto {
  /** Made on the phone when creating: a client added twice is one client. Ignored on update. */
  id?: string;
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  spaceId?: string | null; // per-space CRM
  ownerId?: string | null; // sales owner
  managerIds?: string[] | null; // assigned sales managers
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** The language email to this client is written in. null / "" = not set. */
  locale?: string | null;
  /** Invoice currency outside a workspace. null / "" = the organization's. */
  currency?: string | null;
  /** The company that invoices this client outside a workspace. null / "" = the main one. */
  legalEntityId?: string | null;
  details?: { label: string; value: string }[] | null;
}

/**
 * Refuse a language that is not on the list before anything is forwarded.
 *
 * auth-service refuses it too — it is the boundary, and the phone's offline
 * sync reaches it by another route — but a request that can only fail should
 * fail here, without a round trip and without a module check on the way.
 */
function assertClientLocale(dto: CustomerDto): void {
  if (dto.locale !== undefined && !parseClientLocale(dto.locale).ok) {
    throw new BadRequestException(CLIENT_LOCALE_INVALID_MESSAGE);
  }
  if (dto.currency !== undefined && !parseCurrency(dto.currency, { optional: true }).ok) {
    throw new BadRequestException(CURRENCY_INVALID_MESSAGE);
  }
}

export { CustomerDto, assertClientLocale };
