import { cleanPassCode, daysLeft, lookUpPassCode } from '../pass-code';

const api = (invites: string[], orgs: string[]) => {
  const calls: string[] = [];
  return {
    calls,
    invitation: async (c: string) => { calls.push(`I:${c}`); return { valid: invites.includes(c), organizationName: 'Acme' }; },
    org: async (c: string) => { calls.push(`O:${c}`); return { valid: orgs.includes(c), organizationName: 'Acme' }; },
  };
};

describe('cleanPassCode', () => {
  it('keeps letters and digits, upper-cased, at most ten', () => {
    expect(cleanPassCode('7k2-q9 mx atp99')).toBe('7K2Q9MXATP');
  });
});

describe('lookUpPassCode', () => {
  it('tries the invitation first on an 8-character code, then the organization', async () => {
    const a = api([], ['ACME2026']);
    await expect(lookUpPassCode('ACME2026', a)).resolves.toMatchObject({ kind: 'org' });
    expect(a.calls).toEqual(['I:ACME2026', 'O:ACME2026']);
  });

  it('stops at the invitation when it opens', async () => {
    const a = api(['ACME2026'], ['ACME2026']);
    await expect(lookUpPassCode('ACME2026', a)).resolves.toMatchObject({ kind: 'invite' });
    expect(a.calls).toEqual(['I:ACME2026']);
  });

  it('never asks about an organization for a 10-character code', async () => {
    const a = api([], []);
    await expect(lookUpPassCode('7K2Q9MXATP', a)).resolves.toMatchObject({ kind: 'none' });
    expect(a.calls).toEqual(['I:7K2Q9MXATP']);
  });

  it('asks nobody about a code no kind has', async () => {
    const a = api([], []);
    await expect(lookUpPassCode('ABC', a)).resolves.toMatchObject({ kind: 'none' });
    expect(a.calls).toEqual([]);
  });
});

describe('daysLeft', () => {
  const now = Date.parse('2026-09-27T10:00:00Z');
  it('rounds up, never below zero, null without a date', () => {
    expect(daysLeft('2026-09-29T09:00:00Z', now)).toBe(2);
    expect(daysLeft('2026-09-20T00:00:00Z', now)).toBe(0);
    expect(daysLeft(undefined, now)).toBeNull();
  });
});
