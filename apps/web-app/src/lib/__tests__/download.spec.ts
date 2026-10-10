import { downloadBlob } from '@/lib/download'

describe('downloadBlob', () => {
  const create = jest.fn(() => 'blob:mock')
  const revoke = jest.fn()
  beforeAll(() => {
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
  })
  beforeEach(() => { jest.useFakeTimers(); create.mockClear(); revoke.mockClear() })
  afterEach(() => jest.useRealTimers())

  it('clicks an attached anchor named for the file, then releases the URL on the next tick', () => {
    let clicked: HTMLAnchorElement | null = null
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this
      expect(document.body.contains(this)).toBe(true)
    })
    downloadBlob(new Blob(['a,b']), 'report.csv')
    expect(clicked).not.toBeNull()
    expect(clicked!.download).toBe('report.csv')
    expect(clicked!.getAttribute('href')).toBe('blob:mock')
    expect(document.body.contains(clicked!)).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:mock')
    spy.mockRestore()
  })
})
