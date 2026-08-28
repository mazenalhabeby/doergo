/**
 * The personnel file's pure rules.
 *
 * These are the decisions the rest of the feature is built on — when a
 * credential blocks a dispatch, how long a payslip is kept, what a template may
 * refer to. They live in `@hbcfield/shared` with no I/O, so they can be pinned
 * here exactly, including the clock.
 */
import {
  credentialBlocks,
  credentialStanding,
  daysUntil,
  reminderDueAt,
  retentionUntil,
  memberMayDelete,
  isBlocking,
  canSignInApp,
  periodIsValid,
  periodSortKey,
  availableYears,
  credentialTypesGating,
  CREDENTIAL_REMINDER_DAYS,
  MERGE_FIELDS,
  tokensUsed,
  unknownTokens,
  renderTemplate,
  missingRequired,
} from '@hbcfield/shared';

/** A fixed clock. Every assertion below is relative to this instant. */
const NOW = new Date('2026-08-29T11:00:00.000Z');

describe('daysUntil', () => {
  it('counts calendar days, not elapsed milliseconds', () => {
    // A licence expiring tomorrow at 09:00 is "1 day left" all of today — not
    // zero from 09:01 onwards. Anything else makes the warning flicker.
    expect(daysUntil(new Date('2026-08-30T09:00:00Z'), NOW)).toBe(1);
    expect(daysUntil(new Date('2026-08-30T23:59:00Z'), NOW)).toBe(1);
    expect(daysUntil(new Date('2026-08-29T00:01:00Z'), NOW)).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil(new Date('2026-08-27T12:00:00Z'), NOW)).toBe(-2);
  });

  it('accepts an ISO string, which is what the database hands back', () => {
    expect(daysUntil('2026-09-05T00:00:00.000Z', NOW)).toBe(7);
  });
});

describe('credentialStanding', () => {
  it('treats no expiry date as valid forever, never as unknown', () => {
    // Some qualifications genuinely do not lapse. Forcing a date on them would
    // manufacture alerts nobody can act on.
    expect(credentialStanding(null, NOW)).toBe('VALID');
    expect(credentialStanding(undefined, NOW)).toBe('VALID');
  });

  it('is EXPIRED strictly after the date, and VALID on the day itself', () => {
    expect(credentialStanding('2026-08-29T00:00:00Z', NOW)).toBe('EXPIRING');
    expect(credentialStanding('2026-08-28T00:00:00Z', NOW)).toBe('EXPIRED');
  });

  it('warns inside the window and stays quiet outside it', () => {
    expect(credentialStanding('2026-09-28T00:00:00Z', NOW)).toBe('EXPIRING'); // 30d
    expect(credentialStanding('2026-11-30T00:00:00Z', NOW)).toBe('VALID'); // 93d
  });

  it('takes the window as an argument so an org could widen it', () => {
    expect(credentialStanding('2026-11-30T00:00:00Z', NOW, 120)).toBe('EXPIRING');
  });
});

describe('credentialBlocks', () => {
  it('blocks only on EXPIRED and MISSING', () => {
    expect(credentialBlocks('EXPIRED')).toBe(true);
    expect(credentialBlocks('MISSING')).toBe(true);
  });

  it('does NOT block on EXPIRING', () => {
    // Deliberate. Losing a technician a month early causes exactly the
    // scramble this feature exists to prevent — expiring warns, expired blocks.
    expect(credentialBlocks('EXPIRING')).toBe(false);
    expect(credentialBlocks('VALID')).toBe(false);
  });
});

describe('reminderDueAt', () => {
  it('returns the widest threshold the remaining days fall inside', () => {
    expect(reminderDueAt(59)).toBe(60);
    expect(reminderDueAt(30)).toBe(30);
    expect(reminderDueAt(29)).toBe(30);
    expect(reminderDueAt(7)).toBe(7);
    expect(reminderDueAt(1)).toBe(7);
    expect(reminderDueAt(0)).toBe(7);
  });

  it('is silent outside the widest window', () => {
    expect(reminderDueAt(61)).toBeNull();
  });

  it('is silent once expired — that is a different message entirely', () => {
    expect(reminderDueAt(-1)).toBeNull();
  });

  it('covers every configured threshold', () => {
    for (const t of CREDENTIAL_REMINDER_DAYS) {
      expect(reminderDueAt(t)).toBe(t);
    }
  });
});

describe('retentionUntil', () => {
  it('adds whole months to the issue date', () => {
    const r = retentionUntil(new Date('2026-08-29T00:00:00Z'), 36);
    expect(r?.toISOString().slice(0, 10)).toBe('2029-08-29');
  });

  it('returns null for "keep indefinitely"', () => {
    // Not an oversight: a written employment reference must be producible for
    // thirty years, which makes "never auto-delete" the honest implementation.
    expect(retentionUntil(new Date(), null)).toBeNull();
    expect(retentionUntil(new Date(), 0)).toBeNull();
    expect(retentionUntil(new Date(), undefined)).toBeNull();
  });
});

describe('who may delete what', () => {
  it('lets a member delete only what they supplied', () => {
    expect(memberMayDelete('SUPPLIED')).toBe(true);
    // A payslip the member could remove is not a record of anything.
    expect(memberMayDelete('ISSUED')).toBe(false);
  });
});

describe('signature modes', () => {
  it('blocks the member for both signing and acknowledgement', () => {
    expect(isBlocking('IN_APP')).toBe(true);
    expect(isBlocking('ACKNOWLEDGE')).toBe(true);
    expect(isBlocking('NONE')).toBe(false);
    expect(isBlocking('WET_INK')).toBe(false);
  });

  it('permits in-app signing ONLY for IN_APP', () => {
    expect(canSignInApp('IN_APP')).toBe(true);
    // The whole point of WET_INK: refuse, rather than produce something that
    // looks valid and is not.
    expect(canSignInApp('WET_INK')).toBe(false);
    expect(canSignInApp('ACKNOWLEDGE')).toBe(false);
    expect(canSignInApp('NONE')).toBe(false);
  });
});

describe('periodIsValid', () => {
  it('requires a year and a real month for MONTHLY', () => {
    expect(periodIsValid('MONTHLY', 2026, 8)).toBe(true);
    expect(periodIsValid('MONTHLY', 2026, null)).toBe(false);
    expect(periodIsValid('MONTHLY', 2026, 13)).toBe(false);
    expect(periodIsValid('MONTHLY', 2026, 0)).toBe(false);
  });

  it('requires a year and NO month for ANNUAL', () => {
    expect(periodIsValid('ANNUAL', 2025, null)).toBe(true);
    expect(periodIsValid('ANNUAL', 2025, 6)).toBe(false);
  });

  it('requires neither for ONE_OFF', () => {
    // A contract stamped "August" invents a period that does not exist.
    expect(periodIsValid('ONE_OFF', null, null)).toBe(true);
    expect(periodIsValid('ONE_OFF', 2026, null)).toBe(false);
  });
});

describe('periodSortKey', () => {
  it('orders within a year by month', () => {
    expect(periodSortKey(2026, 8, NOW)).toBeGreaterThan(periodSortKey(2026, 7, NOW));
  });

  it('orders across years', () => {
    expect(periodSortKey(2026, 1, NOW)).toBeGreaterThan(periodSortKey(2025, 12, NOW));
  });

  it('falls back to the issue date for undated documents', () => {
    // Lets a mixed list of payslips and contracts sort without branching.
    expect(periodSortKey(null, null, new Date('2026-03-04T00:00:00Z'))).toBe(202603);
  });
});

describe('availableYears', () => {
  it('lists only years that actually have documents, newest first', () => {
    const years = availableYears([
      { periodYear: 2026, issuedAt: '2026-08-01T00:00:00Z' },
      { periodYear: 2024, issuedAt: '2024-01-01T00:00:00Z' },
      { periodYear: 2026, issuedAt: '2026-01-01T00:00:00Z' },
    ]);
    // 2025 is absent because nothing was issued then — the picker must never
    // offer a year with nothing behind it.
    expect(years).toEqual([2026, 2024]);
  });

  it('uses the issue year when a document has no period', () => {
    expect(availableYears([{ periodYear: null, issuedAt: '2023-06-01T00:00:00Z' }])).toEqual([2023]);
  });
});

describe('credentialTypesGating — the dispatch gate short-circuit', () => {
  const types = [
    { id: 'c1', isCredential: true, isActive: true, requiredForWorkflowIds: ['wf-electrical'] },
    { id: 'c2', isCredential: true, isActive: false, requiredForWorkflowIds: ['wf-electrical'] },
    { id: 'd1', isCredential: false, isActive: true, requiredForWorkflowIds: ['wf-electrical'] },
  ];

  it('returns the credential types that gate this task type', () => {
    expect(credentialTypesGating(types, 'wf-electrical')).toEqual(['c1']);
  });

  it('ignores inactive types and non-credentials', () => {
    expect(credentialTypesGating(types, 'wf-electrical')).not.toContain('c2');
    expect(credentialTypesGating(types, 'wf-electrical')).not.toContain('d1');
  });

  it('gates nothing for an unrelated task type', () => {
    expect(credentialTypesGating(types, 'wf-plumbing')).toEqual([]);
  });

  it('gates nothing when there is no task type at all', () => {
    expect(credentialTypesGating(types, null)).toEqual([]);
  });

  it('returns empty for an organization with no types — the common case', () => {
    // Every existing organization is in this state the day this ships, which
    // is what makes their task-assignment path provably unchanged: the gate
    // returns here, before it ever reaches the database.
    expect(credentialTypesGating([], 'wf-electrical')).toEqual([]);
  });
});

describe('merge fields', () => {
  it('finds the tokens a template uses, once each, in order', () => {
    const body = 'Dear {{member.fullName}}, from {{org.legalName}}. Hello {{member.fullName}}.';
    expect(tokensUsed(body)).toEqual(['member.fullName', 'org.legalName']);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(tokensUsed('{{  member.email  }}')).toEqual(['member.email']);
  });

  it('flags tokens nothing can fill', () => {
    // The failure this prevents: a contract reaching a member with
    // "{{member.iban}}" printed where a number belongs.
    expect(unknownTokens('Pay {{member.iban}} on {{contract.startDate}}')).toEqual(['member.iban']);
    expect(unknownTokens('{{member.fullName}}')).toEqual([]);
  });

  it('every catalogued field is resolvable by its own token', () => {
    const values = Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, f.example]));
    for (const f of MERGE_FIELDS) {
      const { text, missing } = renderTemplate(`{{${f.token}}}`, values);
      expect(missing).toEqual([]);
      expect(text).toBe(f.example);
    }
  });

  it('leaves an unfilled token visible rather than printing nothing', () => {
    // A blank where a start date belongs is a document that looks complete and
    // is not. The token staying visible is what makes the failure obvious.
    const { text, missing } = renderTemplate('Starts {{contract.startDate}}', {});
    expect(text).toBe('Starts {{contract.startDate}}');
    expect(missing).toEqual(['contract.startDate']);
  });

  it('treats an empty string as missing, not as a value', () => {
    const { missing } = renderTemplate('{{member.fullName}}', { 'member.fullName': '' });
    expect(missing).toEqual(['member.fullName']);
  });

  it('inserts numbers as text', () => {
    const { text } = renderTemplate('{{contract.weeklyHours}} h', { 'contract.weeklyHours': 38.5 });
    expect(text).toBe('38.5 h');
  });

  it('does not treat a value that looks like a token as one', () => {
    // Values are inserted verbatim and never re-scanned, so a member whose name
    // contained a token cannot cause a second substitution pass.
    const { text } = renderTemplate('{{member.fullName}}', {
      'member.fullName': '{{org.legalName}}',
      'org.legalName': 'HBC Group GmbH',
    });
    expect(text).toBe('{{org.legalName}}');
  });

  it('names the required fields that would block issuing', () => {
    const missing = missingRequired({ 'member.fullName': 'Monika Holub' });
    expect(missing).toContain('org.legalName');
    expect(missing).toContain('contract.startDate');
    expect(missing).not.toContain('member.fullName');
    // Optional fields never block.
    expect(missing).not.toContain('contract.weeklyHours');
  });

  it('passes when every required field has a value', () => {
    const values = Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, f.example]));
    expect(missingRequired(values)).toEqual([]);
  });
});
