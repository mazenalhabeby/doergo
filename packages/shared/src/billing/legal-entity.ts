/**
 * COMPANIES — several legal entities inside one organization (docs/plans/companies-legal-entities.md).
 *
 * An organization is where people work; a legal entity is whose name goes on the paper. HBC GmbH
 * and HBC USA Inc. share people, clients and workspaces, and differ only in the identity an
 * invoice or a contract carries. These rules are read by the server AND the web, so who issues an
 * invoice, how it is numbered and what is frozen on it cannot drift between them.
 */
export {
  LEGAL_ENTITY_LABEL_MAX,
  LEGAL_NAME_MAX,
  MAX_BANK_ACCOUNTS,
  DEFAULT_INVOICE_PREFIX,
  type LegalEntityIdentity,
  type BankAccountDetails,
  type IssuerSnapshot,
  resolveIssuerEntityId,
  invoiceNumberPrefix,
  nextInvoiceNumber,
  issuerSnapshotOf,
  issuerAddressLines,
  cleanIban,
  cleanBic,
  cleanRoutingNumber,
  cleanInvoicePrefix,
} from './legal-entity-parts/entity-identity';
export {
  type LegalEntityProblem,
  type LegalEntityFields,
  parseLegalEntity,
  parseBankAccounts,
  bankForInvoice,
  COMPANY_UNKNOWN_MESSAGE,
  usableLegalEntityId,
} from './legal-entity-parts/entity-parse';
