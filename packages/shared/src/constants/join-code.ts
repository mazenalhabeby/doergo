/**
 * Which kind of code did somebody just type?
 *
 * Onboarding hands out two codes that look identical to the person holding one:
 *
 *   - the ORGANIZATION join code — exactly 8 characters, shared, and joining
 *     with it raises a request an admin still has to approve;
 *   - a personal INVITATION code — 6 to 10 characters, a bearer credential, and
 *     presenting it makes you a member immediately.
 *
 * The app asks for them on two different screens, each capped at its own length.
 * A member given a 10-character invitation who taps "Join Organization" — the
 * card that says "Have a Code", which is true — types eight characters and the
 * keyboard simply stops responding. Nothing is wrong on screen: no error, no
 * hint, just a field that will not take the rest of the code. That happened to a
 * real member on 2026-09-04 and cost an afternoon.
 *
 * So the entry screens stop assuming which code they were given and ask instead.
 * Eight characters is genuinely ambiguous — it is a valid length for both — so
 * this returns an ORDERED list of what to try, never a single guess: on the
 * organization screen the org code is tried first, and only a code that fails
 * there is offered as an invitation.
 */
import { ORG_CODE_LENGTH } from './onboarding';
import { INVITATION_CODE_LENGTH, INVITATION_CODE_MIN_LENGTH } from './invitation';

export type JoinCodeKind = 'ORG' | 'INVITATION';

/**
 * The longest code any entry box must accept.
 *
 * Every code input bounds itself by THIS, not by the length of the code that
 * screen expects. A field that silently truncates is the one failure mode with
 * no error message and no way for the person typing to tell what went wrong —
 * far worse than accepting a code the screen then explains it cannot use.
 */
export const JOIN_CODE_MAX_LENGTH = Math.max(ORG_CODE_LENGTH, INVITATION_CODE_LENGTH);

/** Could this string be an organization join code? */
export const couldBeOrgCode = (code: string): boolean =>
  code.trim().length === ORG_CODE_LENGTH;

/** Could this string be an invitation code? */
export const couldBeInvitationCode = (code: string): boolean => {
  const n = code.trim().length;
  return n >= INVITATION_CODE_MIN_LENGTH && n <= INVITATION_CODE_LENGTH;
};

/**
 * What to try, in order, for a code typed on a screen that expects `prefer`.
 *
 * Empty when the code cannot be either — which is the screen's cue to say so
 * rather than to call an endpoint that will certainly refuse it.
 */
export function joinCodeCandidates(code: string, prefer: JoinCodeKind): JoinCodeKind[] {
  const kinds: JoinCodeKind[] = [];
  if (couldBeOrgCode(code)) kinds.push('ORG');
  if (couldBeInvitationCode(code)) kinds.push('INVITATION');
  // The screen the person chose gets the first attempt: on an 8-character code
  // both are possible, and the one they asked for is the better guess.
  return kinds.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));
}
