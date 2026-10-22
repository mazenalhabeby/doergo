"use client"

import { UserAvatar, StackedAvatars } from "@/components/common/user-avatar"
import type { Task } from "@/lib/api"

/** A task's crew as stacked faces — the card, the table row and the timeline draw the same small stack. */
export function TaskAssigneesStack({ assignees }: { assignees: NonNullable<Task["assignees"]> }) {
  return (
    <StackedAvatars
      users={assignees.map((a) => ({ id: a.user.id, firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl }))}
      max={3}
      size="xs"
    />
  )
}

/** The single assignee's face, coloured by their id. */
export function TaskPersonAvatar({ person }: { person: NonNullable<Task["assignedTo"]> }) {
  return (
    <UserAvatar
      firstName={person.firstName}
      lastName={person.lastName}
      avatarUrl={person.avatarUrl}
      seed={person.id}
      size="xs"
    />
  )
}
