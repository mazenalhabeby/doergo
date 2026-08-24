import { INVITATION_CODE_LENGTH, INVITATION_CODE_CHARSET } from '@hbcfield/shared';
import { randomBytes } from 'crypto';

/**
 * Audit A-B1 regression.
 *
 * An invitation code is a BEARER credential — `Invitation` has no email column,
 * so whoever presents it joins the organization, with no approval step. That puts
 * the whole security of the flow in the code's entropy, and the rate limits are
 * per-IP and in-process, so they scale with the attacker's proxy pool and with the
 * gateway's replica count rather than bounding the attack.
 *
 * At the original 6 characters the keyspace was ~2^30 and a 500-IP pool expected a
 * hit within a day. These assertions exist so nobody shortens it back.
 */
describe('invitation code entropy (A-B1)', () => {
  const keyspace = () =>
    BigInt(INVITATION_CODE_CHARSET.length) ** BigInt(INVITATION_CODE_LENGTH);

  it('has at least 2^48 of keyspace', () => {
    expect(keyspace()).toBeGreaterThan(2n ** 48n);
  });

  it('is at least 10 characters', () => {
    expect(INVITATION_CODE_LENGTH).toBeGreaterThanOrEqual(10);
  });

  it('excludes the visually ambiguous characters', () => {
    // A human reads these off a screen and types them into a phone.
    for (const c of ['I', 'O', '0', '1']) {
      expect(INVITATION_CODE_CHARSET).not.toContain(c);
    }
  });

  it('has a charset size that divides 256, so `byte % len` carries no modulo bias', () => {
    expect(256 % INVITATION_CODE_CHARSET.length).toBe(0);
  });

  it('generates codes of the right shape, from the charset only', () => {
    // Mirrors generateCode() in invitation.service.ts.
    const gen = () => {
      const bytes = randomBytes(INVITATION_CODE_LENGTH);
      let code = '';
      for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
        code += INVITATION_CODE_CHARSET[bytes[i]! % INVITATION_CODE_CHARSET.length];
      }
      return code;
    };
    const codes = Array.from({ length: 200 }, gen);
    for (const c of codes) {
      expect(c).toHaveLength(INVITATION_CODE_LENGTH);
      expect(c).toMatch(new RegExp(`^[${INVITATION_CODE_CHARSET}]+$`));
    }
    // Sanity: not returning a constant.
    expect(new Set(codes).size).toBeGreaterThan(190);
  });

  it('stays within the accept DTO bounds (6..16)', () => {
    // The DTO keeps a minimum of 6 so pre-change codes still validate.
    expect(INVITATION_CODE_LENGTH).toBeGreaterThanOrEqual(6);
    expect(INVITATION_CODE_LENGTH).toBeLessThanOrEqual(16);
  });
});
