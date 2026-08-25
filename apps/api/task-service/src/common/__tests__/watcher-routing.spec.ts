/**
 * "Notifications about <member>" — who is told when something happens to them.
 *
 * Two independent sources, and the rule is that they ADD UP:
 *   • explicit watchers picked on the member's Access page (NotificationWatch)
 *   • space routing — the per-assignment override, else the space's own
 *     configured notify roles
 *
 * The part worth pinning is that there is NO safety floor. Nothing configured
 * anywhere means nobody is notified, rather than falling back to "every admin",
 * which is what makes a routine event stop being a broadcast.
 */
describe('watcher resolution — explicit ∪ space routing', () => {
  /** Mirrors computeWatchers: explicit watchers, then space routing merged in. */
  const resolve = (opts: {
    explicit?: string[];
    spaceRouting?: string[];
    subjectUserId?: string;
    explicitOnly?: boolean;
  }): string[] => {
    const subject = opts.subjectUserId ?? 'subject';
    const byId = new Map<string, true>();
    for (const id of opts.explicit ?? []) byId.set(id, true);
    if (!opts.explicitOnly) {
      for (const id of opts.spaceRouting ?? []) {
        if (id !== subject && !byId.has(id)) byId.set(id, true);
      }
    }
    return [...byId.keys()].filter((id) => id !== subject).sort();
  };

  it('nothing configured anywhere → nobody is notified', () => {
    expect(resolve({})).toEqual([]);
  });

  it('space routing alone → those recipients', () => {
    expect(resolve({ spaceRouting: ['lead1'] })).toEqual(['lead1']);
  });

  it('explicit watchers alone → those recipients', () => {
    expect(resolve({ explicit: ['anna'] })).toEqual(['anna']);
  });

  it('both configured → BOTH are notified, not one overriding the other', () => {
    expect(resolve({ explicit: ['anna'], spaceRouting: ['lead1'] })).toEqual(['anna', 'lead1']);
  });

  it('someone in both sources is notified once', () => {
    expect(resolve({ explicit: ['anna'], spaceRouting: ['anna', 'lead1'] })).toEqual(['anna', 'lead1']);
  });

  it('the subject is never notified about themselves', () => {
    expect(resolve({ explicit: [], spaceRouting: ['subject', 'lead1'] })).toEqual(['lead1']);
  });

  it('explicitOnly (task events) ignores space routing entirely', () => {
    // So a routine assignment does not alert everyone the space routes to.
    expect(resolve({ explicit: ['anna'], spaceRouting: ['lead1'], explicitOnly: true })).toEqual(['anna']);
  });
});
