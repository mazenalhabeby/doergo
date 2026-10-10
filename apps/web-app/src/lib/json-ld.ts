/**
 * JSON for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is NOT safe inside a script element: a value holding
 * `</script>` (a blog title, a database-backed post body) ends the element and
 * whatever follows runs as HTML. Every `<` is written as `<` — still the
 * same JSON to any parser, never a tag to the browser. `>`, `&` and the two
 * JavaScript line terminators are escaped the same way for good measure.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
