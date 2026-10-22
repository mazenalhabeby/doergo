import {
  activeWindowWhere,
  ORG_ACCESS_SELECT,
  memberAccessOf,
  ownRequestRoute,
  type ApprovalKind,
  type OwnRequestRoute,
  orgAdminIds,
  memberAccessFactsIn,
} from '@hbcfield/shared';

/**
 * Who is asked about a request somebody makes about their OWN time — the
 * shared rule (`ownRequestRoute`) with the two facts it needs read here: what
 * the person may decide themselves, and the other administrators.
 *
 * `usual` is the caller's own answer for an ordinary member (the workspace's
 * leaders, else the member's watchers). It is never padded with admins for a
 * member — only a leader's or an administrator's own request goes up.
 *
 * One query for a member, two for a leader; asked once per request made, never per read of a list.
 */
export interface OwnRequestAsk {
  route: OwnRequestRoute;
  /** Who is asked (never the subject). AUTOMATIC: nobody. */
  ids: string[];
}

export async function askAboutOwnRequest(
  prisma: any,
  params: { organizationId: string; subjectId: string; kind: ApprovalKind; spaceIds: string[]; usual: string[] },
): Promise<OwnRequestAsk> {
  const now = new Date();
  const usual = params.usual.filter((id) => id !== params.subjectId);
  const subject = await memberAccessFactsIn(prisma, {
    userId: params.subjectId,
    organizationId: params.organizationId,
    spaceIds: params.spaceIds,
    now,
  });
  if (!subject) return { route: 'USUAL', ids: usual };
  const who = { isAdmin: subject.role === 'ADMIN', access: memberAccessOf(subject) };
  // A member never reaches the administrators: asked only for a leader or an administrator.
  if (ownRequestRoute(who, params.kind, params.spaceIds, 1) === 'USUAL') return { route: 'USUAL', ids: usual };
  const admins: Array<{ id: string }> = await orgAdminIds(prisma, params.organizationId, params.subjectId);
  const route = ownRequestRoute(who, params.kind, params.spaceIds, admins.length);
  if (route === 'AUTOMATIC') return { route, ids: [] };
  if (route === 'ADMINS') return { route, ids: admins.map((a) => a.id) };
  return { route, ids: usual };
}
