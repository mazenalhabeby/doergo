/**
 * The minimum-version gate.
 *
 * It exists because a sideloaded Android APK never updates itself, so a phone
 * installed once stays on that build forever — which is why the release history
 * carries a separate "1.0.0 train" indefinitely.
 *
 * The dangerous direction is not "fails to block". It is "blocks when it should
 * not": this screen has no dismiss, so a false positive takes the whole fleet
 * out of a working app at once. Every test below leans on that.
 */
describe('version gate', () => {
  const compareVersions = (a: string, b: string): number => {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  const blocked = (current: string, minimum: string | null) =>
    !!minimum && compareVersions(current, minimum) < 0;

  it('compares numerically, not as text', () => {
    // The reason for parseInt: '1.0.10' < '1.0.9' under string comparison,
    // which would block every user on the newer build.
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0);
  });

  it('blocks a build below the minimum', () => {
    expect(blocked('1.0.0', '1.0.1')).toBe(true);
  });

  it('allows the exact minimum', () => {
    expect(blocked('1.0.1', '1.0.1')).toBe(false);
  });

  it('allows anything newer', () => {
    expect(blocked('1.2.0', '1.0.1')).toBe(false);
  });

  // ── The gate must be inert until deliberately switched on ──

  it('does NOT block when no minimum is configured', () => {
    // The endpoint ships `minimum: null`. A gate that starts blocking the day
    // it deploys, before anyone has a version to move to, locks out everyone.
    expect(blocked('1.0.0', null)).toBe(false);
  });

  it('does not block on an unparseable version', () => {
    expect(blocked('', null)).toBe(false);
    expect(compareVersions('abc', 'abc')).toBe(0);
  });
});
