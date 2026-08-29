/**
 * Matching payroll's filenames to the people they belong to.
 *
 * The failure being guarded against is not "the batch did not import". It is
 * one payslip filed against the wrong person — which is unrecoverable, invisible
 * from the admin's side, and the reason this refuses far more often than a
 * cleverer matcher would.
 */
import {
  matchFile,
  matchBatch,
  batchIsPublishable,
  readPeriod,
  tokenize,
  stripExtension,
  type MatchCandidate,
} from '@hbcfield/shared';

const TEAM: MatchCandidate[] = [
  { id: 'u-monika', firstName: 'Monika', lastName: 'Holub', email: 'monika@example.com' },
  { id: 'u-mike', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com' },
  { id: 'u-sarah', firstName: 'Sarah', lastName: 'Wagner', email: 'sarah@example.com' },
  { id: 'u-karim', firstName: 'Karim', lastName: 'Ahmad', email: 'karim@example.com' },
];

describe('tokenize', () => {
  it('folds diacritics, because payroll exports rarely carry them', () => {
    expect(tokenize('Müller')).toEqual(['muller']);
    expect(tokenize('Škoda-Nováková')).toEqual(['skoda', 'novakova']);
  });

  it('expands ß, which folds to nothing useful otherwise', () => {
    expect(tokenize('Weiß')).toEqual(['weiss']);
  });

  it('splits on every separator a filename might use', () => {
    expect(tokenize('2026-08_holub.monika')).toEqual(['2026', '08', 'holub', 'monika']);
  });
});

describe('stripExtension', () => {
  it('removes the extension and nothing else', () => {
    expect(stripExtension('2026.08_holub.pdf')).toBe('2026.08_holub');
  });

  it('leaves a name with no extension alone', () => {
    expect(stripExtension('holub_monika')).toBe('holub_monika');
  });
});

describe('readPeriod', () => {
  it('reads year-first forms', () => {
    expect(readPeriod('2026-08_holub.pdf')).toEqual({ year: 2026, month: 8 });
    expect(readPeriod('2026_08_holub.pdf')).toEqual({ year: 2026, month: 8 });
    expect(readPeriod('202608_holub.pdf')).toEqual({ year: 2026, month: 8 });
  });

  it('reads month-first forms', () => {
    expect(readPeriod('08-2026_holub.pdf')).toEqual({ year: 2026, month: 8 });
  });

  it('reads a bare year for annual documents', () => {
    expect(readPeriod('lohnzettel_2025.pdf')).toEqual({ year: 2025, month: null });
  });

  it('refuses an impossible month rather than guessing', () => {
    // "2026-13" is not a period; taking the year and dropping the month would
    // file it as an annual document, which it is not.
    expect(readPeriod('2026-13_holub.pdf')).toEqual({ year: 2026, month: null });
  });

  it('returns nothing when there is no period to read', () => {
    expect(readPeriod('contract_holub.pdf')).toEqual({ year: null, month: null });
  });

  it('does not mistake a long number for a year', () => {
    expect(readPeriod('invoice_120260812.pdf').year).toBeNull();
  });
});

describe('matchFile', () => {
  it('matches on both names', () => {
    const m = matchFile('2026-08_holub_monika.pdf', TEAM);
    expect(m).toMatchObject({
      userId: 'u-monika',
      confidence: 'EXACT',
      periodYear: 2026,
      periodMonth: 8,
    });
  });

  it('matches whichever order the names appear in', () => {
    expect(matchFile('monika.holub-2026-08.pdf', TEAM).userId).toBe('u-monika');
  });

  it('matches an email local part, and calls that exact', () => {
    const m = matchFile('payslip_mike_2026-08.pdf', TEAM);
    expect(m.userId).toBe('u-mike');
    expect(m.confidence).toBe('EXACT');
  });

  it('downgrades a surname-plus-initial to FUZZY', () => {
    // Offered, but flagged — the admin still has to look at it.
    const m = matchFile('2026-08_wagner_s.pdf', TEAM);
    expect(m).toMatchObject({ userId: 'u-sarah', confidence: 'FUZZY' });
  });

  it('does NOT treat a lone surname as exact even when it is unique', () => {
    // Being the only Weber is a fact about this month's headcount, not about
    // the data. Next month there may be two.
    const m = matchFile('2026-08_weber.pdf', TEAM);
    expect(m.confidence).not.toBe('EXACT');
  });

  it('refuses when two members share the matched name', () => {
    const twins: MatchCandidate[] = [
      { id: 'a', firstName: 'Mike', lastName: 'Weber', email: 'mike.w@example.com' },
      { id: 'b', firstName: 'Mike', lastName: 'Weber', email: 'm.weber@example.com' },
    ];
    const m = matchFile('2026-08_mike_weber.pdf', twins);
    expect(m.userId).toBeNull();
    expect(m.confidence).toBe('UNMATCHED');
    expect(m.reason).toMatch(/more than one/);
  });

  it('returns UNMATCHED rather than a nearest guess', () => {
    const m = matchFile('2026-08_unknown_44.pdf', TEAM);
    expect(m).toMatchObject({ userId: null, confidence: 'UNMATCHED' });
    // The period is still read, so fixing the row by hand is one click.
    expect(m.periodYear).toBe(2026);
  });

  it('matches through folded diacritics', () => {
    const team: MatchCandidate[] = [
      { id: 'u-m', firstName: 'Jürgen', lastName: 'Müller', email: 'jm@example.com' },
    ];
    expect(matchFile('2026-08_mueller_juergen.pdf', team).userId).toBeNull();
    // …but the properly-accented export does match.
    expect(matchFile('2026-08_Müller_Jürgen.pdf', team)).toMatchObject({
      userId: 'u-m',
      confidence: 'EXACT',
    });
  });
});

describe('matchBatch', () => {
  it('matches a clean payroll run', () => {
    const rows = matchBatch(
      ['2026-08_holub_monika.pdf', '2026-08_weber_mike.pdf', '2026-08_karim_ahmad.pdf'],
      TEAM,
    );
    expect(rows.map((r) => r.userId)).toEqual(['u-monika', 'u-mike', 'u-karim']);
    expect(batchIsPublishable(rows)).toBe(true);
  });

  it('unmatches BOTH files when two land on the same member', () => {
    // Payroll exporting the same person twice must not produce two payslips on
    // one record while somebody else's goes missing.
    const rows = matchBatch(['2026-08_weber_mike.pdf', 'mike_weber_august.pdf'], TEAM);
    expect(rows.every((r) => r.userId === null)).toBe(true);
    expect(rows.every((r) => r.reason === 'two files matched this member')).toBe(true);
    expect(batchIsPublishable(rows)).toBe(false);
  });

  it('blocks the whole batch on a single unresolved row', () => {
    const rows = matchBatch(
      ['2026-08_holub_monika.pdf', '2026-08_weber_mike.pdf', '2026-08_unknown_44.pdf'],
      TEAM,
    );
    expect(rows.filter((r) => r.userId).length).toBe(2);
    // Publishing the two that resolved would put SOME payslips out and hide the
    // problem in a half-finished screen.
    expect(batchIsPublishable(rows)).toBe(false);
  });

  it('refuses an empty batch', () => {
    expect(batchIsPublishable([])).toBe(false);
  });

  it('publishes once every row is resolved', () => {
    const rows = matchBatch(['2026-08_holub_monika.pdf'], TEAM);
    expect(batchIsPublishable(rows)).toBe(true);
  });

  it('allows a FUZZY row to publish — flagged, not blocked', () => {
    // The admin has seen it and can change it. Blocking would make a correct
    // guess as expensive as a wrong one.
    const rows = matchBatch(['2026-08_wagner_s.pdf'], TEAM);
    expect(rows[0]!.confidence).toBe('FUZZY');
    expect(batchIsPublishable(rows)).toBe(true);
  });
});
