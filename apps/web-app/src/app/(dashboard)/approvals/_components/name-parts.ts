/** "Juan Diego Castrillon Salazar" → initials J·S, the way every avatar in the app reads. */
export function nameParts(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? "", lastName: parts.length > 1 ? parts[parts.length - 1]! : "" }
}
