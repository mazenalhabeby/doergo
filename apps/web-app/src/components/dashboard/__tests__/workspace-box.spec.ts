import { WORKSPACE_CARD, previewMembers, workspaceCardCols } from '../workspace-box'

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

describe('workspaceCardCols', () => {
  it('gives an empty and a one-person card the same single column', () => {
    expect(workspaceCardCols(0)).toBe(1)
    expect(workspaceCardCols(1)).toBe(1)
  })

  it('grows one column per person up to the cap', () => {
    expect([1, 2, 3, 4].map(workspaceCardCols)).toEqual([1, 2, 3, 4])
  })

  it('stops at the cap, so no card runs away horizontally', () => {
    expect(workspaceCardCols(WORKSPACE_CARD.MAX_COLS + 7)).toBe(WORKSPACE_CARD.MAX_COLS)
  })

  it('is monotonic', () => {
    const cols = [0, 1, 2, 3, 4, 5, 12].map(workspaceCardCols)
    expect(cols).toEqual([...cols].sort((a, b) => a - b))
  })

  it('never returns zero columns, which would collapse the grid', () => {
    expect(workspaceCardCols(-3)).toBe(1)
  })

  /**
   * The width itself is deliberately NOT computed in TS any more: the card is
   * max-content over these columns, so the browser measures it. A JS formula
   * predicting a width from an assumed column size is exactly what let the card
   * and its nodes disagree.
   */
  it('exposes no width formula to drift from the CSS', () => {
    const geometry = WORKSPACE_CARD as Record<string, unknown>
    expect(geometry.NODE_W).toBeUndefined()
    expect(geometry.PAD_X).toBeUndefined()
    expect(geometry.MIN_W).toBeUndefined()
  })
})
