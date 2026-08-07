import { redirect } from "next/navigation"

/**
 * /employees/[id] is retired — a member's full profile (identity, access, tasks,
 * attendance, schedule, time-off, performance, cost) now lives on ONE page:
 * /members/[id]. Preserve old links/bookmarks with a redirect.
 */
export default async function EmployeeDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/members/${id}`)
}
