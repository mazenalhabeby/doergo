/** The consent wording, the employer company, and the values a contract template is filled with. */
import { personName, toISODateString } from '@hbcfield/shared';

/**
 * The consent a member gives before signing.
 *
 * A single constant, stored verbatim on every signature and printed on the
 * certificate page. If the wording ever changes, past signatures keep the words
 * that were actually shown — which is the only version worth having on a record.
 */
export const CONSENT_TEXT =
  'I have read this document and agree to sign it electronically.';

/**
 * The company a contract names as the employer: the member's own (Settings › Companies), else the
 * organization's main company. One select for every place that builds merge values.
 */
export const EMPLOYER_COMPANY_SELECT = {
  legalName: true, addressLine1: true, addressLine2: true, postalCode: true, city: true, state: true,
  country: true, email: true, phone: true, vatId: true, taxId: true, registerNumber: true,
} as const;

export type EmployerCompany = {
  legalName: string; addressLine1: string | null; addressLine2: string | null; postalCode: string | null;
  city: string | null; state: string | null; country: string | null; email: string | null; phone: string | null;
  vatId: string | null; taxId: string | null; registerNumber: string | null;
};

/** Merge-field values for one member. */
export function contractValues(
  member: {
    firstName: string; lastName: string; email: string;
    position: string | null; specialty: string | null;
    employmentStartDate: Date | null;
    employerEntity?: EmployerCompany | null;
    organization: {
      name: string; addressLine1: string | null; city: string | null;
      postalCode: string | null; country: string | null;
      email: string | null; phone: string | null;
      legalEntities?: EmployerCompany[];
    } | null;
  },
  contract: ContractTerms | undefined,
  issuedAt: Date,
  /**
   * What was read off the member's own ID document, and who is issuing.
   *
   * Both are LOOKED UP rather than typed. A passport number retyped into a
   * letter is a letter that reaches a border with a digit wrong, and a signer's
   * name typed into a template body goes stale the day that person changes
   * role — on every document already issued from it.
   */
  extra?: {
    identity?: { documentNumber: string | null; issuingState: string | null } | null;
    issuer?: { firstName: string; lastName: string; position: string | null } | null;
  },
): Record<string, string | number | null> {
  const org = member.organization;
  /*
    ⚠️ THE EMPLOYER IS A COMPANY, not the organization. HBC USA's people are employed by HBC USA
    Inc., not by the Austrian GmbH that shares their workspace — a contract naming the wrong legal
    entity is a contract with the wrong party. Their own company, else the main one, else the
    organization profile (an organization from before companies existed).
  */
  const company = member.employerEntity ?? org?.legalEntities?.[0] ?? null;
  const address = company
    ? [company.addressLine1, company.addressLine2, [company.postalCode, company.city].filter(Boolean).join(' '), company.state]
        .filter(Boolean)
        .join(', ')
    : [org?.addressLine1, [org?.postalCode, org?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const startDate =
    contract?.startDate ?? (member.employmentStartDate ? toISODateString(member.employmentStartDate) : null);

  return {
    'member.fullName': personName(member),
    'member.firstName': member.firstName,
    'member.lastName': member.lastName,
    'member.email': member.email,
    'member.jobTitle': member.position,
    'member.specialty': member.specialty,
    'org.legalName': company?.legalName ?? org?.name ?? null,
    'org.address': address || null,
    'org.country': company?.country ?? org?.country ?? null,
    'org.email': company?.email ?? org?.email ?? null,
    'org.phone': company?.phone ?? org?.phone ?? null,
    'org.vatId': company?.vatId ?? null,
    'org.taxId': company?.taxId ?? null,
    'org.registerNumber': company?.registerNumber ?? null,
    // Space fields resolve to null for now — a member belongs to spaces, not to
    // one space, and picking arbitrarily would put the wrong site on a contract.
    'space.name': null,
    'space.address': null,
    'member.passportNumber': extra?.identity?.documentNumber ?? null,
    'member.nationality': extra?.identity?.issuingState ?? null,
    'contract.startDate': startDate,
    'contract.weeklyHours': contract?.weeklyHours ?? null,
    'contract.issuedOn': toISODateString(issuedAt),
    'contract.endDate': contract?.endDate ?? null,
    'contract.siteName': contract?.siteName ?? null,
    'contract.siteAddress': contract?.siteAddress ?? null,
    'contract.rotation': contract?.rotation ?? null,
    'issuer.fullName': extra?.issuer ? personName(extra.issuer) : null,
    'issuer.jobTitle': extra?.issuer?.position ?? null,
  };
}

/** Terms that are not on the member record and are supplied at issue time. */
export interface ContractTerms {
  startDate?: string;
  weeklyHours?: number | string;
  endDate?: string;
  siteName?: string;
  siteAddress?: string;
  rotation?: string;
}
