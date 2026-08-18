import { WORKSPACE_CARD, previewMembers, workspaceCardWidth } from '../workspace-box'

/**
 * `previewMembers` is the single definition of "who shows on a collapsed card".
 * The card draws its "All quiet today" ghost from it and the grid sorts quiet
 * spaces last by it — if the two ever disagreed, cards would sink while still
 * showing people. `workspaceCardWidth` is shared with the loading skeleton so
 * the placeholder lays out at the sizes the real grid will use.
 */

const P = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i}` })) as never

describe('previewMembers', () => {
  it('is empty only when nobody is clocked in and nobody is reachable off-shift', () => {
    expect(previewMembers({ people: [] })).toEqual([])
  })

  it('counts on-site, in-field, remote and off-shift members', () => {
    const box = { people: P(1), onRoadPeople: P(2), remotePeople: P(3), offShiftPeople: P(4) }
    expect(previewMembers(box)).toHaveLength(10)
  })

  it('excludes offline off-duty members — they only appear inside the open card', () => {
    const box = { people: [], offDutyPeople: P(5) } as never
    expect(previewMembers(box)).toEqual([])
  })

  it('lists clocked-in members before off-shift ones', () => {
    const box = { people: [{ name: 'on' }], offShiftPeople: [{ name: 'off' }] } as never
    expect(previewMembers(box).map((p: { name: string }) => p.name)).toEqual(['on', 'off'])
  })

  it('tolerates the optional group arrays being absent', () => {
    expect(previewMembers({ people: P(2) })).toHaveLength(2)
  })
})

describe('workspaceCardWidth', () => {
  it('gives an empty and a one-person card the same width', () => {
    expect(workspaceCardWidth(0)).toBe(workspaceCardWidth(1))
  })

  it('never goes below the minimum that keeps the quiet label on one line', () => {
    expect(workspaceCardWidth(0)).toBe(WORKSPACE_CARD.MIN_W)
  })

  it('grows one node column at a time', () => {
    const { NODE_W, NODE_GAP, PAD_X } = WORKSPACE_CARD
    expect(workspaceCardWidth(3)).toBe(3 * NODE_W + 2 * NODE_GAP + PAD_X)
  })

  it('stops growing past the column cap, so no card runs away', () => {
    const capped = workspaceCardWidth(WORKSPACE_CARD.MAX_COLS)
    expect(workspaceCardWidth(WORKSPACE_CARD.MAX_COLS + 7)).toBe(capped)
  })

  it('is monotonic up to the cap', () => {
    const widths = [1, 2, 3, 4].map(workspaceCardWidth)
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
  })
})
