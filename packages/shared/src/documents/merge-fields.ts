/**
 * Contract template merge fields.
 *
 * A template is written once per (role × job title) and filled per member. The
 * registry below is the contract between the template editor — which offers the
 * admin a list to insert from — and the renderer, which resolves them. Keeping
 * both ends reading the same array is what stops a template referring to a
 * token nothing fills, which would ship a contract with `{{member.iban}}`
 * printed on it.
 *
 * Naming is `namespace.field`, standardised now rather than later: a template
 * written in year one is still being rendered in year five, and renaming a
 * token silently breaks every document that used it.
 */

export type MergeNamespace = 'member' | 'org' | 'space' | 'contract';

export interface MergeFieldDef {
  /** The token as written in a template, without braces. */
  token: string;
  namespace: MergeNamespace;
  /** English SOURCE for the editor's field list; the UI translates it. */
  label: string;
  /** Shown in the editor so an admin can tell `startDate` from `issuedOn`. */
  example: string;
  /** A contract cannot be rendered while one of these is unresolved. */
  required: boolean;
}

export const MERGE_FIELDS: MergeFieldDef[] = [
  // ── The person ───────────────────────────────────────────────────────────
  { token: 'member.fullName', namespace: 'member', label: 'Full name', example: 'Monika Holub', required: true },
  { token: 'member.firstName', namespace: 'member', label: 'First name', example: 'Monika', required: false },
  { token: 'member.lastName', namespace: 'member', label: 'Last name', example: 'Holub', required: false },
  { token: 'member.email', namespace: 'member', label: 'Email', example: 'monika@example.com', required: false },
  { token: 'member.jobTitle', namespace: 'member', label: 'Job title', example: 'Field Technician', required: true },
  { token: 'member.specialty', namespace: 'member', label: 'Specialty', example: 'Electrical', required: false },

  // ── The employer ─────────────────────────────────────────────────────────
  { token: 'org.legalName', namespace: 'org', label: 'Company name', example: 'HBC Group GmbH', required: true },
  { token: 'org.address', namespace: 'org', label: 'Company address', example: 'Arbeiterheimstraße 32, 4663 Laakirchen', required: true },
  { token: 'org.country', namespace: 'org', label: 'Country', example: 'AT', required: false },
  { token: 'org.email', namespace: 'org', label: 'Company email', example: 'office@hbc-group.eu', required: false },
  { token: 'org.phone', namespace: 'org', label: 'Company phone', example: '+43 7613 12345', required: false },

  // ── Where they work ──────────────────────────────────────────────────────
  { token: 'space.name', namespace: 'space', label: 'Workspace', example: 'Laakirchen', required: false },
  { token: 'space.address', namespace: 'space', label: 'Workspace address', example: 'Arbeiterheimstraße 32', required: false },

  // ── The terms ────────────────────────────────────────────────────────────
  { token: 'contract.startDate', namespace: 'contract', label: 'Start date', example: '01.09.2026', required: true },
  {
    token: 'contract.weeklyHours',
    namespace: 'contract',
    label: 'Weekly hours',
    // Taken from the contract rather than typed twice. The overtime threshold
    // is configured separately today, so the same number lives in two places
    // and drifts; sourcing it here is what stops that.
    example: '38.5',
    required: false,
  },
  { token: 'contract.issuedOn', namespace: 'contract', label: 'Issue date', example: '28.08.2026', required: true },
];

const TOKEN_SET = new Set(MERGE_FIELDS.map((f) => f.token));

/**
 * Matches `{{ token }}` with optional inner whitespace.
 *
 * Deliberately narrow: letters, digits, dot and underscore only. A template is
 * admin-authored text that ends up rendered into a PDF, so the pattern must not
 * be a place where arbitrary expressions can hide.
 */
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

/** Every token a template body references, in order of first appearance. */
export function tokensUsed(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(TOKEN_RE)) {
    const token = m[1];
    // The capture group is not optional in the pattern, but the compiler cannot
    // know that; a guard is cheaper than an assertion that could outlive the regex.
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Tokens the template uses that this system cannot fill. */
export function unknownTokens(body: string): string[] {
  return tokensUsed(body).filter((t) => !TOKEN_SET.has(t));
}

/**
 * Render a template body against resolved values.
 *
 * Returns the text plus anything that could not be filled. The caller decides
 * what to do about it — and for a contract the answer is always "refuse",
 * because a document that reaches a member with `{{contract.startDate}}` where
 * a date belongs is worse than one that never arrives.
 *
 * Values are inserted verbatim. This produces the SOURCE TEXT for a PDF, not
 * HTML: it is handed to the PDF renderer, never to a browser, so there is no
 * markup context for a value to escape into.
 */
export function renderTemplate(
  body: string,
  values: Record<string, string | number | null | undefined>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(TOKEN_RE, (whole, token: string) => {
    const v = values[token];
    if (v === null || v === undefined || v === '') {
      if (!missing.includes(token)) missing.push(token);
      return whole; // leave the token visible so the failure is obvious
    }
    return String(v);
  });
  return { text, missing };
}

/**
 * Required tokens with no value — the check that blocks issuing.
 *
 * Separate from `renderTemplate`'s `missing` on purpose: an optional token left
 * blank is fine and should render as nothing, while a required one is a refusal.
 */
export function missingRequired(
  values: Record<string, string | number | null | undefined>,
): string[] {
  return MERGE_FIELDS.filter((f) => f.required)
    .filter((f) => {
      const v = values[f.token];
      return v === null || v === undefined || v === '';
    })
    .map((f) => f.token);
}
