import { scopeWhere, scopeWhereOn, scopeAllows } from '@hbcfield/shared';

/**
 * The narrowing that stands between a space-scoped grant and the whole
 * organization's attendance.
 *
 * The gateway guard only WIDENS — none of the attendance routes names a space,
 * so a grant in one space satisfies "granted anywhere" and the request is let
 * through. Everything that keeps it honest afterwards is here, and the property
 * worth pinning is not that it filters but that its three states stay DISTINCT.
 */
describe('attendance scope', () => {
  describe('scopeWhere', () => {
    it('does not narrow an org-wide grant', () => {
      expect(scopeWhere(null)).toEqual({});
    });

    it('does not narrow an internal call that passes nothing', () => {
      expect(scopeWhere(undefined)).toEqual({});
    });

    it('narrows to the granted spaces', () => {
      expect(scopeWhere(['a', 'b'])).toEqual({ locationId: { in: ['a', 'b'] } });
    });

    /*
      The one that matters.

      Granted in NO space must match nothing. If `[]` were treated the same as
      `null` — which one plain truthiness check would do — the filter would be
      dropped and somebody with no attendance grant anywhere would read every
      site in the organization. This test exists to fail loudly if anybody
      "simplifies" the two states into one.
    */
    it('matches NOTHING when granted in no space — never everything', () => {
      expect(scopeWhere([])).toEqual({ locationId: { in: [] } });
      expect(scopeWhere([])).not.toEqual({});
    });
  });

  describe('scopeAllows — the write-side check', () => {
    it('allows anything for an org-wide grant', () => {
      expect(scopeAllows(null, 'space-1')).toBe(true);
      expect(scopeAllows(undefined, 'space-1')).toBe(true);
    });

    it('allows a space that was granted', () => {
      expect(scopeAllows(['space-1', 'space-2'], 'space-2')).toBe(true);
    });

    it('refuses a space that was not', () => {
      expect(scopeAllows(['space-1'], 'space-2')).toBe(false);
    });

    it('refuses when granted nowhere', () => {
      expect(scopeAllows([], 'space-1')).toBe(false);
    });

    it('refuses a row with no space rather than letting it through', () => {
      // A null locationId must never pass a scoped check by being falsy on both
      // sides — "belongs to no space" is not "belongs to yours".
      expect(scopeAllows(['space-1'], null)).toBe(false);
      expect(scopeAllows(['space-1'], undefined)).toBe(false);
    });
  });
});

/**
 * The `spaceId`-named variant, for models that do not call it `locationId`
 * (ShiftInstance, GeofenceExcursion).
 *
 * It exists because those call sites wrote `scope ? { spaceId: { in: scope } }
 * : {}` by hand, which is correct ONLY because an empty array is truthy in
 * JavaScript — the right answer reached by accident. A tidy-up to
 * `scope?.length ? … : {}` would drop the filter for a caller granted nothing,
 * and they would read every space in the organization.
 */
describe('scopeWhereOn', () => {
  it('does not narrow an org-wide grant', () => {
    expect(scopeWhereOn('spaceId', null)).toEqual({});
    expect(scopeWhereOn('spaceId', undefined)).toEqual({});
  });

  it('narrows to the granted spaces', () => {
    expect(scopeWhereOn('spaceId', ['a'])).toEqual({ spaceId: { in: ['a'] } });
  });

  it('matches NOTHING when granted nowhere — not everything', () => {
    expect(scopeWhereOn('spaceId', [])).toEqual({ spaceId: { in: [] } });
    expect(scopeWhereOn('spaceId', [])).not.toEqual({});
  });
});
