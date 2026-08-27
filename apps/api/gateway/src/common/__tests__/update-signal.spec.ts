/**
 * Two signals, one endpoint — and the difference between them matters more
 * than either.
 *
 *   blocked         current < minimum   the app stops
 *   updateAvailable current < latest    the app says so and carries on
 *
 * Raising `minimum` before the store has published locks people out of an app
 * that works. That happened in production: the floor went to 1.0.1 while the
 * stores still served 1.0.0, and the only way out was a server-side rollback.
 * `latest` reaches the same people with the same message and strands nobody.
 */
describe("update signals", () => {
  const cmp = (a: string, b: string): number => {
    const pa = a.split(".").map((n) => parseInt(n, 10) || 0)
    const pb = b.split(".").map((n) => parseInt(n, 10) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
  const signals = (current: string, minimum: string | null, latest: string | null) => ({
    blocked: !!minimum && cmp(current, minimum) < 0,
    updateAvailable: !!latest && cmp(current, latest) < 0,
  })

  it("tells an old build about an update without blocking it", () => {
    // The configuration that is actually live: floor at 1.0.0, latest 1.0.1.
    expect(signals("1.0.0", "1.0.0", "1.0.1")).toEqual({ blocked: false, updateAvailable: true })
  })

  it("says nothing at all to a current build", () => {
    expect(signals("1.0.1", "1.0.0", "1.0.1")).toEqual({ blocked: false, updateAvailable: false })
  })

  it("blocks only when the floor is genuinely above the build", () => {
    expect(signals("1.0.0", "1.0.1", "1.0.1").blocked).toBe(true)
  })

  it("never blocks when no floor is configured, whatever latest says", () => {
    expect(signals("0.9.0", null, "1.0.1")).toEqual({ blocked: false, updateAvailable: true })
  })

  it("does not nag a build NEWER than latest", () => {
    // A tester on an unreleased build should not be told to downgrade.
    expect(signals("1.1.0", "1.0.0", "1.0.1").updateAvailable).toBe(false)
  })
})
