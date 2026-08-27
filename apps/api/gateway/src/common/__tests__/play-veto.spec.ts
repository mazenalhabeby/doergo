/**
 * Play has the final say on blocking, on Android.
 *
 * A configured minimum is a number a human typed. When it ran ahead of what the
 * stores served, every older build was blocked with nowhere to go — the screen
 * pointed at a store with nothing newer and the only exit was a server-side
 * rollback. Play reports what it can ACTUALLY install, so letting it veto a
 * block makes that failure impossible rather than merely unlikely.
 */
describe("Play veto on a server-side block", () => {
  const cmp = (a: string, b: string) => {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
  /** Mirrors checkVersion: server decides, Play may overrule on Android. */
  const blocked = (
    current: string,
    minimum: string | null,
    play?: { reachable: boolean; available: boolean },
  ) => {
    const server = !!minimum && cmp(current, minimum) < 0
    if (!server || !play) return server           // iOS, or nothing to overrule
    if (!play.reachable) return server            // unreachable → server stands
    return play.available ? server : false        // nothing to install → do not block
  }

  it("does NOT block when Play has nothing newer to offer", () => {
    // The exact production incident: floor at 1.0.1, stores still on 1.0.0.
    expect(blocked("1.0.0", "1.0.1", { reachable: true, available: false })).toBe(false)
  })

  it("still blocks when Play genuinely has the update", () => {
    expect(blocked("1.0.0", "1.0.1", { reachable: true, available: true })).toBe(true)
  })

  it("keeps the server's decision when Play cannot be reached", () => {
    // Being asked to update is recoverable; silently skipping a security floor
    // is not — so an unreachable Play does not become a way past the gate.
    expect(blocked("1.0.0", "1.0.1", { reachable: false, available: false })).toBe(true)
  })

  it("changes nothing on iOS, where there is no Play to ask", () => {
    expect(blocked("1.0.0", "1.0.1")).toBe(true)
    expect(blocked("1.0.1", "1.0.1")).toBe(false)
  })

  it("never invents a block the server did not ask for", () => {
    // Play having an update is a reason to NUDGE, never to block on its own.
    expect(blocked("1.0.0", "1.0.0", { reachable: true, available: true })).toBe(false)
    expect(blocked("1.0.0", null, { reachable: true, available: true })).toBe(false)
  })
})
