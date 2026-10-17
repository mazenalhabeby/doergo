import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  ACCESS_PERMISSION_SCHEMA,
  ROLE_COMBO_MESSAGES,
  RateChangeError,
  AssignmentPermissionsError,
} from '@hbcfield/shared';
import type { SpaceMemberAuthorityMessage } from '@hbcfield/shared/microservices';

// Permission keys that make sense on a SPACE role.
const SPACE_PERMISSION_KEYS = ACCESS_PERMISSION_SCHEMA.filter((p) => p.scopes.includes('space')).map((p) => p.key);

// `position` is the free-form job title an admin typed — "IT Engineering",
// "Sales", "CEO". The member lists show it under the name, and a list that
// displays a field should carry it rather than have the browser join it back
// on from somewhere else.
const userSelect = {
  /*
    ⚠️ `isExternal` is here so the screen can tell the two apart. An external
    member works for a client or a partner, not for us — we neither pay them nor
    bill their hours, so a rate is meaningless on them, and the roster must be
    able to say so without a second request per row.
  */
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    avatarUrl: true,
    position: true,
    isExternal: true,
  },
};

// `personalAssignmentId` set = this person's own permissions here (the builder), not a role from the list.
const roleSelect = {
  select: { id: true, name: true, slug: true, color: true, permissions: true, kind: true, personalAssignmentId: true },
};

/**
 * What the caller may change about people in THIS workspace, decided at the
 * gateway from the route's space (`mayAddSpaceMembers`, `mayGrantSpaceRoles`,
 * `mayManageSpaceMembers`) and enforced here, where the role's kind is known.
 * Absent = all three (internal callers and tests that predate the split).
 */
export type SpaceMemberAuthority = SpaceMemberAuthorityMessage;

function authorityRefusal(what: string): ForbiddenException {
  return new ForbiddenException({ message: `You cannot ${what} in this workspace`, code: 'SPACE_MEMBER_NOT_ALLOWED' });
}

/** The shared writer's refusal as this service's HTTP exception — status, message, code, params intact. */
function toHttp(e: unknown): never {
  if (e instanceof AssignmentPermissionsError) {
    const body = e.toBody();
    if (e.status === 404) throw new NotFoundException(body);
    if (e.status === 403) throw new ForbiddenException(body);
    throw new BadRequestException(body);
  }
  throw e;
}

/** A refusal the screens can translate, with the rule's own sentence as the fallback. */
function comboRefusal(code: keyof typeof ROLE_COMBO_MESSAGES): BadRequestException {
  return new BadRequestException({ message: ROLE_COMBO_MESSAGES[code], code });
}

/** A rate change the shared rule refused, as a 400 rather than a 500. */
async function withRateErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RateChangeError)
      throw new BadRequestException({ message: e.message, code: `RATE_START_${e.code}` });
    throw e;
  }
}

export { SPACE_PERMISSION_KEYS, userSelect, roleSelect, authorityRefusal, toHttp, comboRefusal, withRateErrors };
