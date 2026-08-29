/**
 * Contracts an administrator can start from.
 *
 * The editor used to open on an empty textarea and ask somebody to write an
 * employment contract in it, using tokens they had to learn first. Almost
 * nobody starts a legal document from nothing — they start from the last one,
 * or from something a lawyer gave them, and change the parts that differ.
 *
 * These are that starting point. They are DELIBERATELY PLAIN and deliberately
 * short: a starter that reads like finished legal advice invites somebody to
 * ship it unread, and the wording that matters is the customer's own. Every one
 * of them is meant to be edited.
 *
 * Not legal advice, and the editor says so.
 *
 * The English text below is the SOURCE, not what renders. The web editor reads
 * `documents.templates.starters.<key>.{name,description,body}` from the locale
 * files, so an Austrian administrator opening "Dienstvertrag" gets German
 * clauses rather than English ones. A test in the web app asserts the two
 * English copies stay identical — edit this file and en.json together.
 */

import type { SignatureMode } from './types';

export interface StarterTemplate {
  key: string;
  /** English SOURCE for the picker; the UI translates by key. */
  name: string;
  description: string;
  signatureMode: SignatureMode;
  /** Which document type this wants, by the type's key where one matches. */
  suggestedTypeKey: string;
  body: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'employment',
    name: 'Employment contract',
    description: 'Position, hours, notice. The one most people need first.',
    signatureMode: 'IN_APP',
    suggestedTypeKey: 'employment_contract',
    body: [
      '§1 Position',
      '',
      '{{member.fullName}} is engaged by {{org.legalName}}, {{org.address}}, as {{member.jobTitle}}, commencing {{contract.startDate}}.',
      '',
      '§2 Working time',
      '',
      'Regular weekly working time is {{contract.weeklyHours}} hours. The distribution of those hours follows the agreed rota and may be varied by agreement.',
      '',
      '§3 Place of work',
      '',
      'Work is performed at customer sites and at the company premises, as assigned.',
      '',
      '§4 Notice',
      '',
      'Either party may terminate this agreement in accordance with the statutory notice periods.',
      '',
      '§5 Confidentiality',
      '',
      'Customer details, pricing and site information are confidential and may not be shared or retained after this engagement ends.',
      '',
      'Issued on {{contract.issuedOn}}.',
    ].join('\n'),
  },
  {
    key: 'freelance',
    name: 'Freelance agreement',
    description: 'For contractors who invoice, carry their own insurance and set their own hours.',
    signatureMode: 'IN_APP',
    suggestedTypeKey: 'freelance_agreement',
    body: [
      '§1 Engagement',
      '',
      '{{member.fullName}} is engaged by {{org.legalName}}, {{org.address}}, as an independent contractor providing {{member.jobTitle}} services from {{contract.startDate}}.',
      '',
      '§2 Independence',
      '',
      'The contractor determines their own working time and method, carries their own insurance, and is responsible for their own tax and social contributions. Nothing in this agreement creates an employment relationship.',
      '',
      '§3 Fees',
      '',
      'Work is invoiced monthly against agreed rates. Invoices are settled within 30 days of receipt.',
      '',
      '§4 Equipment',
      '',
      'The contractor provides their own tools unless equipment is issued separately and receipted.',
      '',
      'Issued on {{contract.issuedOn}}.',
    ].join('\n'),
  },
  {
    key: 'confidentiality',
    name: 'Confidentiality agreement',
    description: 'Signed once, on joining. Covers customer data and site access.',
    signatureMode: 'IN_APP',
    suggestedTypeKey: 'confidentiality',
    body: [
      '§1 Scope',
      '',
      'In the course of this engagement {{member.fullName}} will encounter customer addresses, access codes, pricing and site details that are confidential to {{org.legalName}} and to its clients.',
      '',
      '§2 Obligation',
      '',
      'This information may not be shared, photographed or retained after the engagement ends, in any form, including on personal devices.',
      '',
      '§3 Duration',
      '',
      'This obligation continues for three years after the engagement ends.',
      '',
      'Issued on {{contract.issuedOn}}.',
    ].join('\n'),
  },
  {
    key: 'equipment',
    name: 'Equipment handover',
    description: 'What was issued, in what condition, and when it comes back.',
    signatureMode: 'IN_APP',
    suggestedTypeKey: 'equipment_handover',
    body: [
      'Issued to {{member.fullName}} on {{contract.issuedOn}}:',
      '',
      '  Vehicle                        —',
      '  Phone                          —',
      '  Tools                          —',
      '  Fuel card                      —',
      '',
      'Condition',
      '',
      'Items are checked and photographed at handover. Damage beyond fair wear and tear is reported on the day it happens.',
      '',
      'Return',
      '',
      'All items return to {{org.legalName}} on the last working day of the engagement.',
    ].join('\n'),
  },
  {
    key: 'conduct',
    name: 'Code of conduct',
    description: 'Read and confirmed rather than signed. Good for anything that applies to everyone.',
    signatureMode: 'ACKNOWLEDGE',
    suggestedTypeKey: 'code_of_conduct',
    body: [
      'On site',
      '',
      'Identify yourself, work to the agreed scope, and leave the site as you found it.',
      '',
      'With customers',
      '',
      'No additional work is agreed verbally. Anything beyond the order goes back to the office before it starts.',
      '',
      'Reporting',
      '',
      'Anything unsafe, damaged or disputed is reported the same day.',
      '',
      'Issued by {{org.legalName}} on {{contract.issuedOn}}.',
    ].join('\n'),
  },
  {
    key: 'blank',
    name: 'Start from nothing',
    description: 'An empty page, if you are pasting in your own wording.',
    signatureMode: 'IN_APP',
    suggestedTypeKey: '',
    body: '',
  },
];

/** A starter by key. */
export function starterTemplate(key: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * How well a template's binding fits one person — the SAME arithmetic the
 * server uses to decide which contract somebody actually gets.
 *
 *   -1  not for this person at all
 *    0  binds to nothing: the organization default
 *    1  matches on job title
 *    2  matches on role
 *    3  matches on both
 *
 * It lives here, and the server calls it, because the admin screen shows the
 * answer BEFORE anything is saved. Two copies of this rule would mean a screen
 * that promises one contract and an invitation that issues another.
 */
export function scoreTemplateBinding(
  binding: { appliesToRoleId?: string | null; appliesToPosition?: string | null },
  person: { memberRoleId?: string | null; position?: string | null },
): number {
  const wantedPosition = binding.appliesToPosition?.trim().toLowerCase() || null;
  const theirPosition = person.position?.trim().toLowerCase() || null;

  const roleMatches = !!binding.appliesToRoleId && binding.appliesToRoleId === person.memberRoleId;
  const posMatches = !!wantedPosition && !!theirPosition && wantedPosition === theirPosition;

  // A template naming a role or a position that does NOT match is not a
  // fallback — it is a template for somebody else.
  if (binding.appliesToRoleId && !roleMatches) return -1;
  if (wantedPosition && !posMatches) return -1;

  if (roleMatches && posMatches) return 3;
  if (roleMatches) return 2;
  if (posMatches) return 1;
  return 0;
}

/** Everyone a template is ELIGIBLE for, ignoring competition from other templates. */
export function audienceFor<T extends { memberRoleId?: string | null; position?: string | null }>(
  members: T[],
  binding: { appliesToRoleId?: string | null; appliesToPosition?: string | null },
): T[] {
  return members.filter((m) => scoreTemplateBinding(binding, m) >= 0);
}

/**
 * Who each template will ACTUALLY reach, once they compete.
 *
 * Eligibility is not the answer an administrator needs. The server issues one
 * contract per person — the best-scoring one — so an organization default is
 * eligible for everybody while reaching only the people no sharper template
 * claims. A screen reporting eligibility would tell somebody their default
 * covers thirteen people on the day it covers four.
 *
 * Ties go to the earlier template in the list, which is the order the server
 * reads them in.
 */
export function resolveAudiences<
  T extends { memberRoleId?: string | null; position?: string | null },
  B extends { id: string; appliesToRoleId?: string | null; appliesToPosition?: string | null },
>(members: T[], templates: B[]): Map<string, T[]> {
  const out = new Map<string, T[]>(templates.map((t) => [t.id, []]));

  for (const person of members) {
    let winner: B | null = null;
    let best = -1;
    for (const tpl of templates) {
      const s = scoreTemplateBinding(tpl, person);
      if (s > best) {
        best = s;
        winner = tpl;
      }
    }
    if (winner && best >= 0) out.get(winner.id)!.push(person);
  }

  return out;
}
