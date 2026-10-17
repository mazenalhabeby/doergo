import { EMPLOYER_COMPANY_SELECT } from './document-common';

/**
 * Contract templates, and issuing a contract rendered from one.
 *
 * Part of the personnel file; `DocumentsService` is the facade every caller uses.
 */
/** Everything a contract's {{tokens}} fill from: the member, their employer company, the organization. */
const CONTRACT_MEMBER_SELECT = {
  id: true, firstName: true, lastName: true, email: true,
  position: true, specialty: true, memberRoleId: true,
  employmentStartDate: true,
  employerEntity: { select: EMPLOYER_COMPANY_SELECT },
  organization: {
    select: {
      name: true, addressLine1: true, city: true, postalCode: true,
      country: true, email: true, phone: true,
      legalEntities: { where: { isMain: true }, take: 1, select: EMPLOYER_COMPANY_SELECT },
    },
  },
} as const;

export { CONTRACT_MEMBER_SELECT };
