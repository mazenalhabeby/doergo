import { redirect } from "next/navigation"

/**
 * The old address of the document register.
 *
 * It was called "sent", which was wrong twice over: the page holds every
 * document in the organization — issued AND supplied by members — and half of
 * it is a filing cabinet rather than an outbox. Nothing there was posted
 * anywhere.
 *
 * A permanent redirect rather than a deleted route: this URL is in bookmarks,
 * in browser history and in any email somebody pasted it into, and none of that
 * is worth breaking to tidy a folder name.
 */
export default function SentDocumentsRedirect() {
  redirect("/documents/all")
}
