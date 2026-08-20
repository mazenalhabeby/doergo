import { redirect } from "next/navigation"

// Task types belong to the space that runs them, so there is no organization-wide
// screen to land on any more. The spaces list is the way in: pick a space, then
// its Task Types tab.
export default function TaskTypesRedirect() {
  redirect("/locations")
}
