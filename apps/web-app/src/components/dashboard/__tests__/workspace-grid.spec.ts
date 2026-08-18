import { sortWorkspaceBoxes } from '../workspace-grid'
import type { WorkspaceBoxProps } from '../workspace-box'

const box = (title: string, over: Partial<WorkspaceBoxProps> = {}): WorkspaceBoxProps =>
  ({ title, type: 'fixed', people: [], ...over }) as WorkspaceBoxProps

const P = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `${i}` })) as never

describe('sortWorkspaceBoxes', () => {
  it('sinks quiet spaces below every space that has someone', () => {
    const out = sortWorkspaceBoxes([
      box('quiet-1'),
      box('busy', { people: P(2) }),
      box('quiet-2'),
    ])
    expect(out.map((b) => b.title)).toEqual(['busy', 'quiet-1', 'quiet-2'])
  })

  it('treats an off-shift-only space as NOT quiet — someone is still shown on it', () => {
    const out = sortWorkspaceBoxes([box('quiet'), box('offshift', { offShiftPeople: P(1) })])
    expect(out[0].title).toBe('offshift')
  })

  it('ignores off-duty members when deciding quiet, matching the card ghost', () => {
    const out = sortWorkspaceBoxes([box('busy', { people: P(1) }), box('offduty', { offDutyPeople: P(9) } as never)])
    expect(out.map((b) => b.title)).toEqual(['busy', 'offduty'])
  })

  it('puts bigger on-site teams first within the non-quiet group', () => {
    const out = sortWorkspaceBoxes([box('small', { people: P(1) }), box('big', { people: P(3) })])
    expect(out.map((b) => b.title)).toEqual(['big', 'small'])
  })

  it('is stable: equal boxes keep their incoming order', () => {
    const out = sortWorkspaceBoxes([box('a'), box('b'), box('c')])
    expect(out.map((b) => b.title)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the array it is given', () => {
    const input = [box('quiet'), box('busy', { people: P(2) })]
    const before = input.map((b) => b.title)
    sortWorkspaceBoxes(input)
    expect(input.map((b) => b.title)).toEqual(before)
  })

  it('handles an empty grid', () => {
    expect(sortWorkspaceBoxes([])).toEqual([])
  })
})
