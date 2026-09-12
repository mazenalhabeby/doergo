import {
  buildLabourLines, labourTotalCents, type LabourEntry,
} from '@hbcfield/shared/client';

/**
 * The same work, written up three ways.
 *
 * ⚠️ THE INVARIANT THIS FILE EXISTS FOR: every line multiplies out. Hours ×
 * rate on the page equals the amount on the page, in all three groupings —
 * because the first customer to check an invoice with a calculator finds
 * anything else.
 *
 * The first version promised instead that the three TOTALS would be identical,
 * and the awkward-hours test below caught it: holding that promise meant a line
 * printing 5.83h and charging 5.8333h. The trade was made the other way round
 * once the test made it visible.
 */
const ENTRIES: LabourEntry[] = [
  { taskId: 't1', taskTitle: 'Replace circulation pump', workerId: 'u1', workerName: 'Ahmed Karim', hours: 3.33, billRateCents: 4000, costRateCents: 2000 },
  { taskId: 't2', taskTitle: 'Annual service',           workerId: 'u1', workerName: 'Ahmed Karim', hours: 2.5,  billRateCents: 4000, costRateCents: 2000 },
  { taskId: 't3', taskTitle: 'Emergency call-out',       workerId: 'u2', workerName: 'Lisa Adler',  hours: 1.75, billRateCents: 8500, costRateCents: 3200 },
];

describe('every line multiplies out', () => {
  /*
    ⚠️ THE PROPERTY THAT MATTERS. Whatever grouping is chosen, hours × rate on
    the page equals the amount on the page — because the first customer to check
    an invoice with a calculator finds anything else, and that is a phone call
    and a credit note rather than a rounding curiosity.
  */
  it.each(['task', 'member', 'both'] as const)('%s', (grouping) => {
    for (const line of buildLabourLines(ENTRIES, grouping)) {
      expect(line.amountCents).toBe(Math.round(line.quantity * line.unitPriceCents));
    }
  });

  it('holds on hours that do not divide nicely', () => {
    // Seven jobs of twenty minutes — the case that produced the bug this
    // replaced, where the line said 5.83h and charged 5.8333h.
    const awkward: LabourEntry[] = Array.from({ length: 7 }, (_, i) => ({
      taskId: `t${i}`, taskTitle: `Job ${i}`, workerId: 'u1', workerName: 'Ahmed Karim',
      hours: 1 / 3, billRateCents: 8533, costRateCents: null,
    }));
    for (const g of ['task', 'member', 'both'] as const) {
      for (const line of buildLabourLines(awkward, g)) {
        expect(line.amountCents).toBe(Math.round(line.quantity * line.unitPriceCents));
      }
    }
  });
});

describe('the groupings price the same work', () => {
  it('agrees exactly when the hours are clean', () => {
    // Which is nearly always: half-hours and quarter-hours round identically
    // however they are added up.
    const clean: LabourEntry[] = [
      { taskId: 'a', taskTitle: 'A', workerId: 'u1', workerName: 'Ahmed', hours: 3, billRateCents: 4000, costRateCents: null },
      { taskId: 'b', taskTitle: 'B', workerId: 'u1', workerName: 'Ahmed', hours: 2.5, billRateCents: 4000, costRateCents: null },
    ];
    const t = labourTotalCents(buildLabourLines(clean, 'task'));
    expect(labourTotalCents(buildLabourLines(clean, 'member'))).toBe(t);
    expect(labourTotalCents(buildLabourLines(clean, 'both'))).toBe(t);
    expect(t).toBe(4000 * 5.5);
  });

  it('differs only by what itemising loses, and no more', () => {
    /*
      ⚠️ NOT "a couple of cents" — I assumed that and the numbers said otherwise.

      Seven jobs of twenty minutes is 2.33h together and 7 × 0.33h = 2.31h
      itemised, because each line's hours round to two decimals. At €85.33 that
      is €1.70 of real difference, and neither figure is wrong: the invoice
      charges what its lines SAY, and those lines say different amounts of time.
      The aggregate is the more faithful of the two.

      So the bound is what itemising can lose — half a cent of an hour per line,
      at that line's rate — rather than a number that felt small. Loose enough to
      be true, tight enough that a real arithmetic mistake still fails it.
    */
    const RATE = 8533;
    const awkward: LabourEntry[] = Array.from({ length: 7 }, (_, i) => ({
      taskId: `t${i}`, taskTitle: `Job ${i}`, workerId: 'u1', workerName: 'Ahmed Karim',
      hours: 1 / 3, billRateCents: RATE, costRateCents: null,
    }));
    const t = labourTotalCents(buildLabourLines(awkward, 'task'));
    const m = labourTotalCents(buildLabourLines(awkward, 'member'));

    const mostOneLineCanLose = Math.ceil(RATE * 0.005);
    expect(Math.abs(t - m)).toBeLessThanOrEqual(awkward.length * mostOneLineCanLose);
    // And the aggregate is never the SMALLER one — itemising loses time, it
    // cannot invent it.
    expect(m).toBeGreaterThanOrEqual(t);
  });
});

describe('by job', () => {
  const lines = buildLabourLines(ENTRIES, 'task');

  it('is one priced line per task', () => {
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => !l.descriptive)).toBe(true);
    expect(lines[0]!.description).toContain('Replace circulation pump');
    expect(lines[0]!.taskId).toBe('t1');
  });

  it('carries the rate snapshot on every line', () => {
    // An issued invoice has to keep answering "what was the rate then".
    expect(lines[0]!.billRateCents).toBe(4000);
    expect(lines[0]!.costRateCents).toBe(2000);
    expect(lines[0]!.billedHours).toBe(3.33);
  });
});

describe('by person', () => {
  const lines = buildLabourLines(ENTRIES, 'member');

  it('is one priced line per worker', () => {
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.description)).toEqual([
      'Ahmed Karim · 5.83h',
      'Lisa Adler · 1.75h',
    ]);
  });

  it('keeps different rates apart instead of averaging them', () => {
    /*
      ⚠️ Grouped by (worker, rate), not by worker. One person normally has one
      rate at one client — but if it changed mid-period, folding them into a
      single line would have to invent an average, and an averaged rate on an
      invoice is a number the customer cannot check against anything.
    */
    const mixed: LabourEntry[] = [
      { taskId: 'a', taskTitle: 'A', workerId: 'u1', workerName: 'Ahmed', hours: 2, billRateCents: 4000, costRateCents: null },
      { taskId: 'b', taskTitle: 'B', workerId: 'u1', workerName: 'Ahmed', hours: 2, billRateCents: 4500, costRateCents: null },
    ];
    const out = buildLabourLines(mixed, 'member');
    expect(out).toHaveLength(2);
    expect(out.map((l) => l.unitPriceCents).sort()).toEqual([4000, 4500]);
  });

  it('names work with nobody on it rather than dropping it', () => {
    const orphan: LabourEntry[] = [
      { taskId: 'x', taskTitle: 'Site clear-up', hours: 4, billRateCents: 4000, costRateCents: null },
    ];
    expect(buildLabourLines(orphan, 'member', 'Unassigned')[0]!.description)
      .toBe('Unassigned · 4h');
  });
});

describe('both', () => {
  const lines = buildLabourLines(ENTRIES, 'both');

  it('prices the person and merely lists the jobs', () => {
    /*
      ⚠️ The jobs are descriptive. Charging for them AS WELL as for the hours
      they are part of would bill the same work twice — which is why the flag
      exists rather than a comment asking the next person to remember.
    */
    const priced = lines.filter((l) => !l.descriptive);
    const detail = lines.filter((l) => l.descriptive);
    expect(priced).toHaveLength(2);
    expect(detail).toHaveLength(3);
    expect(detail.every((l) => l.amountCents === 0 && l.unitPriceCents === 0)).toBe(true);
  });

  it('puts each job under the person who did it', () => {
    expect(lines.map((l) => l.description)).toEqual([
      'Ahmed Karim · 5.83h',
      'Replace circulation pump — 3.33h',
      'Annual service — 2.5h',
      'Lisa Adler · 1.75h',
      'Emergency call-out — 1.75h',
    ]);
  });

  it('keeps the task link on the detail lines', () => {
    // So a later reader can still get from the invoice back to the job.
    expect(lines.find((l) => l.descriptive)!.taskId).toBe('t1');
  });
});

describe('work with no rate', () => {
  const noRate: LabourEntry[] = [
    { taskId: 't1', taskTitle: 'Goodwill visit', workerId: 'u1', workerName: 'Ahmed', hours: 2, billRateCents: null, costRateCents: null },
  ];

  it('is listed at nothing rather than dropped', () => {
    // A job that happened belongs on the invoice; the price is a question for
    // the person raising it, and a missing line is one nobody asks.
    for (const g of ['task', 'member', 'both'] as const) {
      const lines = buildLabourLines(noRate, g);
      expect(lines.some((l) => l.description.includes('Ahmed') || l.description.includes('Goodwill'))).toBe(true);
      expect(labourTotalCents(lines)).toBe(0);
    }
  });
});
