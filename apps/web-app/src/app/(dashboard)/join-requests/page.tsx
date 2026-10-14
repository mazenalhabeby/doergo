import { redirect } from "next/navigation"

/** Decided in Approvals now — the one place every decision is made. Kept so old links and bookmarks still land. */
export default function Page() {
  redirect("/approvals?kind=join")
}
