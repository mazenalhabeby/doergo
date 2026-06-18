import { redirect } from "next/navigation"

// Task types are managed in one place now — the unified editor under Settings.
export default function TaskTypesRedirect() {
  redirect("/settings?section=workflows")
}
