import { jsonLdHtml } from "@/lib/json-ld"
import { isSameAppPath } from "@/lib/safe-links"

describe("jsonLdHtml", () => {
  it("cannot close the script element", () => {
    const html = jsonLdHtml({ headline: "</script><script>alert(1)</script>", body: "a & b > c" })
    expect(html).not.toContain("<")
    expect(html).not.toContain(">")
    expect(html).toContain("\\u003c/script\\u003e")
  })

  it("is still the same JSON", () => {
    const data = { a: "</script>", b: "x & y", c: "\u2028line" }
    expect(JSON.parse(jsonLdHtml(data))).toEqual(data)
  })
})

describe("isSameAppPath", () => {
  it.each(["/tasks/1", "/", "/blog/post?x=1#h"])("accepts %s", (h) => expect(isSameAppPath(h)).toBe(true))
  it.each(["//evil.com/x", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "tasks/1", "", undefined, null])(
    "refuses %s",
    (h) => expect(isSameAppPath(h)).toBe(false),
  )
})
