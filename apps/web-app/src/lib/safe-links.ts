/**
 * Is this a path inside THIS app — safe for `<Link>` / `router.push`?
 *
 * "Starts with /" is not enough: `//evil.com/x` is a protocol-relative URL to
 * another host, and browsers read `/\evil.com` the same way. Either one, fed to
 * `router.push` or a same-tab `<Link>`, sends the reader off-site while looking
 * like an internal link. Everything that is not a same-app path is external.
 */
export function isSameAppPath(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")
}
