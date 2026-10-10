jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

// eslint-disable-next-line import/first
import { pageRange } from '../list-page'

describe('pageRange — the rows a page shows, 1-based', () => {
  it('a full first page', () => {
    expect(pageRange(1, 20, 95)).toEqual({ startItem: 1, endItem: 20 })
  })

  it('the short last page ends at the total', () => {
    expect(pageRange(5, 20, 95)).toEqual({ startItem: 81, endItem: 95 })
  })

  it('nothing at all reads 0 to 0', () => {
    expect(pageRange(1, 20, 0)).toEqual({ startItem: 0, endItem: 0 })
  })
})
