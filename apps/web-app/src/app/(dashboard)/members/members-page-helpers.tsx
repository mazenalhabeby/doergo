"use client";

import dynamic from "next/dynamic";

/** MembersPage's module-level helpers, moved here unchanged so its sections can read them too. */
// Lazy (audit M-C1). These four dialogs are ~1,455 lines that only render after a
// click, and they were being shipped in the first paint of a page whose job is a
// table. ssr:false because none of them renders on the server anyway.
export const CreateInvitationDialog = dynamic(
  () => import("@/components/invitations/create-invitation-dialog").then((m) => m.CreateInvitationDialog),
  { ssr: false },
)

export const ManageRolesDialog = dynamic(
  () => import("@/components/roles/manage-roles-dialog").then((m) => m.ManageRolesDialog),
  { ssr: false },
)

export const EditMemberDialog = dynamic(
  () => import("./_components/edit-member-dialog").then((m) => m.EditMemberDialog),
  { ssr: false },
)

export const AccessBuilder = dynamic(
  () => import("@/components/access-builder").then((m) => m.AccessBuilder),
  { ssr: false },
)
