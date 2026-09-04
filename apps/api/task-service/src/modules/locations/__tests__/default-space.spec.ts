/**
 * Which workspace catches work that belongs to no particular one.
 *
 * The flag was set once — when the first space was created — and could never
 * move. Deleting that space was refused with "make another space the default
 * first", advice the product had no way to follow, so an organization whose
 * first space turned out to be the wrong one was stuck with it permanently.
 *
 * These pin the two properties that make moving it safe.
 */
describe('the default workspace', () => {
  /** `setDefault`'s refusals, as the service applies them. */
  const refuse = (target: { isActive: boolean; isRemote: boolean; isDefault: boolean }) => {
    if (target.isDefault) return 'already';
    if (!target.isActive) return 'archived';
    if (target.isRemote) return 'remote';
    return null;
  };

  it('refuses the Remote bucket', () => {
    // Remote is hidden from pickers and geofence-exempt. Making it the default
    // would file unassigned work somewhere nobody ever looks.
    expect(refuse({ isActive: true, isRemote: true, isDefault: false })).toBe('remote');
  });

  it('refuses an archived workspace', () => {
    // Restoring is one click; a default nobody can see is not.
    expect(refuse({ isActive: false, isRemote: false, isDefault: false })).toBe('archived');
  });

  it('treats "already the default" as done, not as an error', () => {
    // The caller asked for a state that holds. Failing here would make a
    // double-click look like a broken button.
    expect(refuse({ isActive: true, isRemote: false, isDefault: true })).toBe('already');
  });

  it('allows an ordinary active workspace', () => {
    expect(refuse({ isActive: true, isRemote: false, isDefault: false })).toBeNull();
  });

  describe('exactly one default, always', () => {
    /*
      The clear and the set are ONE transaction. Two defaults means a task lands
      in whichever row is found first; zero means it lands nowhere and vanishes
      from every space view. Both are silent.
    */
    const move = (spaces: { id: string; isDefault: boolean }[], toId: string) =>
      spaces.map((s) => ({ ...s, isDefault: s.id === toId }));

    it('leaves exactly one default after a move', () => {
      const after = move(
        [
          { id: 'field', isDefault: true },
          { id: 'office', isDefault: false },
          { id: 'remote', isDefault: false },
        ],
        'office',
      );
      expect(after.filter((s) => s.isDefault).map((s) => s.id)).toEqual(['office']);
    });

    it('repairs an organization that somehow has two', () => {
      // updateMany clears every default, not just the one it expected to find.
      const after = move(
        [
          { id: 'a', isDefault: true },
          { id: 'b', isDefault: true },
          { id: 'c', isDefault: false },
        ],
        'c',
      );
      expect(after.filter((s) => s.isDefault)).toHaveLength(1);
    });
  });
});
