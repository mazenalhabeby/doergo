import { redirect } from "next/navigation"

/** /employees is retired — the single roster lives at /members. */
export default function EmployeesListRedirect() {
  redirect("/members")
}
