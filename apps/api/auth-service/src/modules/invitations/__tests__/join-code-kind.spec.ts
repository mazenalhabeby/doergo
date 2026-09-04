import {
  joinCodeCandidates,
  couldBeOrgCode,
  couldBeInvitationCode,
  JOIN_CODE_MAX_LENGTH,
  ORG_CODE_LENGTH,
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_MIN_LENGTH,
} from '@hbcfield/shared';

/**
 * The 2026-09-04 regression, in one sentence: a member holding a 10-character
 * invitation tapped "Join Organization — Have a Code" and the field stopped
 * accepting input at eight characters, with no error and nothing on screen to
 * say why.
 *
 * Both halves of that are asserted here — that every entry box is bounded by the
 * LONGEST code, and that a code arriving on the wrong screen is recognised
 * instead of refused.
 */
describe('telling the two onboarding codes apart', () => {
  const ORG = 'ACME2026'; // exactly 8
  const INVITE = 'CDXKTY6G9C'; // exactly 10 — the code that started this
  const LEGACY = 'AB3D6F'; // 6, issued before the entropy raise

  it('bounds every code box by the longest code, not by the screen it sits on', () => {
    expect(JOIN_CODE_MAX_LENGTH).toBe(Math.max(ORG_CODE_LENGTH, INVITATION_CODE_LENGTH));
    expect(JOIN_CODE_MAX_LENGTH).toBeGreaterThanOrEqual(INVITE.length);
  });

  it('recognises a 10-character invitation typed on the organization screen', () => {
    expect(couldBeOrgCode(INVITE)).toBe(false);
    expect(joinCodeCandidates(INVITE, 'ORG')).toEqual(['INVITATION']);
  });

  it('recognises an organization code typed on the invitation screen', () => {
    expect(joinCodeCandidates(ORG, 'INVITATION')).toContain('ORG');
  });

  it('tries the screen you chose first when the length fits both', () => {
    // Eight characters is a real ambiguity: a valid org code AND a valid legacy
    // invitation. Neither screen may assume — but the one the person opened is
    // the better first guess.
    expect(joinCodeCandidates(ORG, 'ORG')[0]).toBe('ORG');
    expect(joinCodeCandidates(ORG, 'INVITATION')[0]).toBe('INVITATION');
    expect(joinCodeCandidates(ORG, 'ORG')).toHaveLength(2);
  });

  it('still accepts invitation codes issued before the entropy raise', () => {
    expect(LEGACY.length).toBe(INVITATION_CODE_MIN_LENGTH);
    expect(couldBeInvitationCode(LEGACY)).toBe(true);
    expect(joinCodeCandidates(LEGACY, 'ORG')).toEqual(['INVITATION']);
  });

  it('offers nothing for a code that cannot be either', () => {
    // The screen's cue to say so itself rather than call an endpoint that will
    // certainly refuse it.
    expect(joinCodeCandidates('ABC', 'ORG')).toEqual([]);
    expect(joinCodeCandidates('A'.repeat(INVITATION_CODE_LENGTH + 1), 'ORG')).toEqual([]);
    expect(joinCodeCandidates('', 'INVITATION')).toEqual([]);
  });

  it('ignores surrounding whitespace, the way a paste carries it', () => {
    expect(couldBeInvitationCode(`  ${INVITE}  `)).toBe(true);
    expect(couldBeOrgCode(` ${ORG} `)).toBe(true);
  });
});
