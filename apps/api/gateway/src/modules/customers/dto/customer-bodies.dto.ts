import { OptArray, OptBoolean, OptNumber, OptObject, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Client (CRM) bodies (CODE_AUDIT.md B3). Clients: the web client form, the phone's add-client
  sheet, edit sheet, record chips and card reader, and the phone's offline queue (which sends
  the client-made `id`). Only TYPES are checked: language, currency, company and every CRM rule
  stay where they were (assertClientLocale here, auth-service for the rest).
*/

/** POST /customers · PATCH /customers/:id — the auth-service contract's fields, all optional. */
export class CustomerDto {
  /** Made on the phone when creating: a client added twice is one client. Ignored on update. */
  @OptString() id?: string;
  @OptString() name?: string;
  @OptString() contactName?: string | null;
  @OptString() email?: string | null;
  @OptString() phone?: string | null;
  @OptString() address?: string | null;
  @OptString() notes?: string | null;
  @OptBoolean() isActive?: boolean;
  @OptBoolean() isPortalResident?: boolean;
  @OptString() portalId?: string | null;
  @OptString() spaceId?: string | null; // per-space CRM
  @OptString() ownerId?: string | null; // sales owner
  @OptStrings() managerIds?: string[] | null; // assigned sales managers
  @OptString() status?: string; // CRM lifecycle stage
  @OptString() type?: string; // PERSON | COMPANY
  @OptString() legalName?: string | null;
  @OptString() website?: string | null;
  @OptString() industry?: string | null;
  @OptString() vatId?: string | null;
  @OptString() regNumber?: string | null;
  /** The language email to this client is written in. null / "" = not set. */
  @OptString() locale?: string | null;
  /** Invoice currency outside a workspace. null / "" = the organization's. */
  @OptString() currency?: string | null;
  /** The company that invoices this client outside a workspace. null / "" = the main one. */
  @OptString() legalEntityId?: string | null;
  @OptArray() details?: { label: string; value: string }[] | null;
}

/** PATCH /customers/contacts/:linkId */
export class UpdateCustomerContactDto {
  @OptString() role?: string | null;
  @OptBoolean() isPrimary?: boolean;
}

/** POST /customers/:id/contacts — an existing person, or a new one. */
export class AddCustomerContactDto {
  @OptString() personId?: string;
  @OptObject() person?: { name?: string; email?: string; phone?: string };
  @OptString() role?: string;
  @OptBoolean() isPrimary?: boolean;
}

/** POST /customers/:id/activities — `id` is the phone's client-made id (offline queue). */
export class AddCustomerActivityDto {
  @OptString() id?: string;
  @OptString() type?: string;
  @OptString() body?: string;
  @OptString() dueAt?: string;
  @OptString() reminderKind?: string;
  @OptNumber() remindBeforeMin?: number;
  @OptString() reminderAssigneeId?: string | null;
  @OptString() repeat?: string;
}

/** PATCH /customers/:id/activities/:activityId */
export class UpdateCustomerActivityDto {
  @OptString() body?: string;
  @OptString() dueAt?: string | null;
  @OptBoolean() done?: boolean;
  @OptString() reminderKind?: string;
  @OptNumber() remindBeforeMin?: number;
  @OptString() reminderAssigneeId?: string | null;
  @OptString() repeat?: string;
}

/** POST /customers/:id/invite */
export class InviteCustomerDto {
  @OptString() email?: string;
  @OptString() portalId?: string;
}
