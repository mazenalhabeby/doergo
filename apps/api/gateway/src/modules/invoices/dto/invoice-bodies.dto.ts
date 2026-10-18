import { OptAny, OptArray, OptBoolean, OptIn, OptNumber, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Invoice bodies (CODE_AUDIT.md B3). Client: the web's new / edit invoice pages
  (lib/api/invoices.ts). The edit page sends Partial<CreateInvoiceInput>, so the update DTO
  declares the create fields too (the service takes only the editable ones, as before).
  Line items are checked as an array; their fields are the service's. Only TYPES here.
*/

const LINE_KINDS = ['HOURS', 'DAYS', 'HEADING', null] as const;

class InvoiceFieldsDto {
  @OptString() spaceId?: string;
  @OptString() legalEntityId?: string | null;
  @OptString() customerId?: string | null;
  @OptString() clientName?: string;
  @OptString() clientEmail?: string;
  @OptString() clientAddress?: string;
  @OptString() currency?: string;
  /** 1 {currency} = exchangeRate {organization's}; a number or a typed string, read by the service. */
  @OptAny() exchangeRate?: number | string | null;
  @OptString() exchangeRateSource?: string | null;
  @OptString() exchangeRateDate?: string | null;
  @OptBoolean() showLineTags?: boolean;
  @OptNumber() taxRate?: number;
  @OptNumber() discount?: number;
  @OptString() issueDate?: string;
  @OptString() dueDate?: string;
  @OptString() servicePeriodFrom?: string;
  @OptString() servicePeriodTo?: string;
  @OptString() notes?: string;
  @OptArray() items?: Array<Record<string, unknown>>;
}

/** POST /invoices */
export class CreateInvoiceDto extends InvoiceFieldsDto {}

/** PATCH /invoices/:id */
export class UpdateInvoiceDto extends InvoiceFieldsDto {}

/** PATCH /invoices/:id/status */
export class InvoiceStatusDto {
  @OptString() status!: string;
}

/** POST /invoices/:id/items — the web's InvoiceItemInput. */
export class InvoiceItemDto {
  @OptString() description!: string;
  @OptNumber() quantity?: number;
  @OptNumber() unitPrice?: number;
  @OptString() taskId?: string | null;
  @OptString() reportId?: string | null;
  @OptNumber() billRateCents?: number | null;
  @OptNumber() costRateCents?: number | null;
  @OptNumber() billedHours?: number | null;
  @OptNumber() billedDays?: number | null;
  @OptIn(LINE_KINDS) lineKind?: 'HOURS' | 'DAYS' | 'HEADING' | null;
  @OptString() workerId?: string | null;
  @OptString() dayFrom?: string | null;
  @OptString() dayTo?: string | null;
  @OptStrings() taskIds?: string[];
  @OptString() hoursBasis?: string | null;
}
