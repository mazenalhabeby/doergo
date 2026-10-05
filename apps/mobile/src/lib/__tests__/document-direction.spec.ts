import { memberMayDelete, memberMaySupply, requirementsFor } from '@hbcfield/shared/client';

/** A document type either side may file — the office, or the member (documents/rules.ts). */
describe('document direction BOTH', () => {
  it('a member may upload SUPPLIED and BOTH types, never ISSUED', () => {
    expect(memberMaySupply('SUPPLIED')).toBe(true);
    expect(memberMaySupply('BOTH')).toBe(true);
    expect(memberMaySupply('ISSUED')).toBe(false);
  });

  it("on BOTH, only the member's own upload may be removed — the office copy is locked", () => {
    expect(memberMayDelete('BOTH', true)).toBe(true);
    expect(memberMayDelete('BOTH', false)).toBe(false);
    expect(memberMayDelete('SUPPLIED')).toBe(true);
    expect(memberMayDelete('ISSUED', true)).toBe(false);
  });

  it('a BOTH type can be required; an ISSUED one never is', () => {
    const base = { label: 'x', isActive: true, isCredential: true, hasExpiry: true, requiredFromAll: true, requiredFromRoleIds: [] };
    const req = requirementsFor({ memberRoleId: null }, [
      { ...base, id: 'both', direction: 'BOTH' },
      { ...base, id: 'iss', direction: 'ISSUED' },
      { ...base, id: 'sup', direction: 'SUPPLIED' },
    ]);
    expect(req.map((t) => t.id).sort()).toEqual(['both', 'sup']);
  });
});
