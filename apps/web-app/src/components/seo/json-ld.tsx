import { jsonLdHtml } from "@/lib/json-ld"

/** The one way to inline structured data — escaped by `jsonLdHtml`. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />
}
