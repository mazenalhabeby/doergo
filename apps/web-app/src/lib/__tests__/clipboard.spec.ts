const copyFailed = jest.fn()
jest.mock("@/lib/toast", () => ({ notify: { copyFailed: () => copyFailed() } }))

import { copyText } from "@/lib/clipboard"

describe("copyText", () => {
  const setClipboard = (writeText?: jest.Mock) =>
    Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true })

  beforeEach(() => {
    copyFailed.mockReset()
    ;(document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => false)
  })

  it("returns true when the clipboard accepts", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    await expect(copyText("abc")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("abc")
    expect(copyFailed).not.toHaveBeenCalled()
  })

  it("reports a refused copy and returns false — never 'Copied'", async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error("NotAllowedError")))
    await expect(copyText("abc")).resolves.toBe(false)
    expect(copyFailed).toHaveBeenCalledTimes(1)
  })

  it("falls back to execCommand when the async API is missing", async () => {
    setClipboard(undefined)
    ;(document as unknown as { execCommand: jest.Mock }).execCommand = jest.fn(() => true)
    await expect(copyText("abc")).resolves.toBe(true)
    expect(copyFailed).not.toHaveBeenCalled()
  })

  it("stays quiet when asked", async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error("x")))
    await expect(copyText("abc", { silent: true })).resolves.toBe(false)
    expect(copyFailed).not.toHaveBeenCalled()
  })
})
