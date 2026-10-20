import {
  resolveAwayAccess,
  spaceAllowsAway,
  isGeofencePolicy,
  DEFAULT_GEOFENCE_POLICY,
} from '@hbcfield/shared';

/**
 * The ceiling and the grant.
 *
 * The property that matters most is that they are INDEPENDENT: a site that
 * requires presence refuses everybody including an administrator, and a site
 * that permits away days still refuses anybody who was not granted one. An
 * earlier design collapsed the two, which would have handed remote clock-in to
 * everyone at a workspace the moment it was switched on.
 */
describe('working away from a site', () => {
  const PINNED = { spaceHasPin: true };

  describe('the ceiling — a fact about the place', () => {
    it('refuses everybody at a strict site, however they are granted', () => {
      expect(resolveAwayAccess({ ...PINNED, policy: 'STRICT', userAllowRemote: true }))
        .toEqual({ allowed: false, reason: 'SITE_STRICT' });
      expect(resolveAwayAccess({ ...PINNED, policy: 'STRICT', assignmentAllowRemote: true }))
        .toEqual({ allowed: false, reason: 'SITE_STRICT' });
    });

    it('refuses an ADMINISTRATOR at a strict site', () => {
      // The point of separating the two. "You cannot be away from a factory
      // floor" is a statement about the floor, not a privilege anybody outranks.
      expect(resolveAwayAccess({ ...PINNED, policy: 'STRICT', isAdmin: true }))
        .toEqual({ allowed: false, reason: 'SITE_STRICT' });
    });

    it('is what an unknown or missing policy falls back to', () => {
      // A value that is not a policy must not accidentally open a site up.
      expect(DEFAULT_GEOFENCE_POLICY).toBe('STRICT');
      for (const bad of [undefined, null, '', 'ANYTHING', 'strict', 42]) {
        expect(resolveAwayAccess({ ...PINNED, policy: bad as string, userAllowRemote: true }).allowed).toBe(false);
      }
    });

    it('lets a pin-less workspace through — there is no ring to be outside of', () => {
      expect(resolveAwayAccess({ spaceHasPin: false, policy: 'STRICT' }))
        .toEqual({ allowed: true, reason: 'NO_GEOFENCE' });
    });

    it('lets a site through that has switched its ring off', () => {
      expect(resolveAwayAccess({ ...PINNED, policy: 'NONE' }))
        .toEqual({ allowed: true, reason: 'NO_GEOFENCE' });
    });
  });

  describe('the grant — a decision about a person', () => {
    const OPEN = { ...PINNED, policy: 'AWAY_ALLOWED' as const };

    it('refuses somebody who was never granted it, even where it is permitted', () => {
      // The packer at a workspace that allows the seller to be away.
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: false }))
        .toEqual({ allowed: false, reason: 'NOT_GRANTED' });
      expect(resolveAwayAccess(OPEN)).toEqual({ allowed: false, reason: 'NOT_GRANTED' });
    });

    it('allows somebody granted on their account', () => {
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: true }))
        .toEqual({ allowed: true, reason: 'GRANTED' });
    });

    it('allows an administrator without an explicit grant', () => {
      expect(resolveAwayAccess({ ...OPEN, isAdmin: true })).toEqual({ allowed: true, reason: 'GRANTED' });
    });
  });

  describe('the per-workspace override', () => {
    const OPEN = { ...PINNED, policy: 'AWAY_ALLOWED' as const };

    it('follows the account when it says nothing — which is how every assignment starts', () => {
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: true, assignmentAllowRemote: null }).allowed).toBe(true);
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: false, assignmentAllowRemote: undefined }).allowed).toBe(false);
    });

    it('REFUSES here somebody who is granted on their account', () => {
      // Lisa travels for Main Office and is only ever physically at the yard.
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: true, assignmentAllowRemote: false }))
        .toEqual({ allowed: false, reason: 'NOT_GRANTED' });
    });

    it('ALLOWS here somebody who is not granted on their account', () => {
      expect(resolveAwayAccess({ ...OPEN, userAllowRemote: false, assignmentAllowRemote: true }))
        .toEqual({ allowed: true, reason: 'GRANTED' });
    });

    it('still cannot climb over the ceiling', () => {
      expect(resolveAwayAccess({ ...PINNED, policy: 'STRICT', assignmentAllowRemote: true }).allowed).toBe(false);
    });
  });

  describe('what a screen asks before it knows who is asking', () => {
    it('offers the choice only where the site could ever admit it', () => {
      expect(spaceAllowsAway(true, 'STRICT')).toBe(false);
      expect(spaceAllowsAway(true, 'AWAY_ALLOWED')).toBe(true);
      expect(spaceAllowsAway(true, 'NONE')).toBe(true);
      expect(spaceAllowsAway(false, 'STRICT')).toBe(true); // no pin, no ring
      expect(spaceAllowsAway(true, undefined)).toBe(false); // unknown → the safe default
    });
  });

  it('recognises exactly the three policies', () => {
    expect(['STRICT', 'AWAY_ALLOWED', 'NONE'].every(isGeofencePolicy)).toBe(true);
    expect(isGeofencePolicy('OFF')).toBe(false);
  });
});
