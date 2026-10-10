import fs from "fs"
import path from "path"

/**
 * Every request to the gateway goes through ONE client (lib/http-client.ts, the
 * shared core plugged in) and every path through the endpoint table.
 *
 * Each rule below names a way the old client was bypassed:
 *   • a bare `fetch` skipped the token refresh, the timeout and the 429 retry —
 *     and could send a bearer token to any host;
 *   • `/api/v1` typed into a file is a second idea of where the API lives
 *     (lib/endpoints.ts is the one);
 *   • `\`/tasks/${id}\`` without the `path` tag let an id with a `/`, `?` or `#`
 *     in it become a different endpoint (the review found ~211 of them).
 */

const SRC = path.join(process.cwd(), "src")

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== "__tests__" && e.name !== "node_modules") yield* walk(full)
    } else if (/\.(ts|tsx)$/.test(e.name)) yield full
  }
}

/** Strip comments — they quote the very patterns this looks for. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:/"'`])\/\/[^\n]*/g, "$1")
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/")
const files = [...walk(SRC)].map((f) => ({ file: rel(f), src: code(fs.readFileSync(f, "utf8")) }))

/**
 * The only files allowed to call `fetch`, each for a reason the client cannot serve.
 */
const FETCH_ALLOWED: Record<string, string> = {
  "lib/http-client.ts": "the client itself (and the server render's Next-cached fetch for the blog)",
  "lib/auth-session.ts": "the refresh call — the client's own 401 handling calls it, so it cannot go through the client",
  "lib/pdf-common.ts": "a blob read of an image link the API minted (presigned storage), into a PDF",
}

/** Presigned S3 uploads (with progress) — the one place a browser talks to storage directly. */
const XHR_ALLOWED = ["lib/api/uploads.ts"]

describe("the HTTP boundary", () => {
  it("nothing outside the client calls fetch", () => {
    const offenders = files
      .filter(({ file, src }) => !(file in FETCH_ALLOWED) && /(^|[^\w.])fetch\s*\(/.test(src))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("the allow-list is not stale", () => {
    for (const file of Object.keys(FETCH_ALLOWED)) {
      const f = files.find((x) => x.file === file)
      expect({ file, exists: !!f }).toEqual({ file, exists: true })
    }
  })

  it("XMLHttpRequest only for presigned uploads", () => {
    const offenders = files.filter(({ file, src }) => !XHR_ALLOWED.includes(file) && /new XMLHttpRequest\b/.test(src)).map((f) => f.file)
    expect(offenders).toEqual([])
  })

  it("`/api/v1` is written only in lib/endpoints.ts", () => {
    const offenders = files.filter(({ file, src }) => file !== "lib/endpoints.ts" && src.includes("/api/v1")).map((f) => f.file)
    expect(offenders).toEqual([])
  })

  it("every templated API path in lib/api goes through the `path` tag", () => {
    const offenders: string[] = []
    for (const { file, src } of files) {
      if (!file.startsWith("lib/api/")) continue
      // A template literal that starts like an API path and interpolates something.
      const re = /(\w*)\s*`(\/[^`]*\$\{[^`]*)`/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        if (m[1] !== "path") offenders.push(`${file}: \`${m[2].slice(0, 60)}\``)
      }
    }
    expect(offenders).toEqual([])
  })

  it("lib/api names no path at all — every request is an endpoint from the shared table", () => {
    const offenders: string[] = []
    for (const { file, src } of files) {
      if (!file.startsWith("lib/api/") || file.startsWith("lib/api/types/")) continue
      // `http.get('/x')`, `call('/x')`, `api.post(\`/x\`)`
      if (/\.(get|post|put|patch|delete|upload|request)\s*(<[^>]*>)?\s*\(\s*['"`]\//.test(src)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
