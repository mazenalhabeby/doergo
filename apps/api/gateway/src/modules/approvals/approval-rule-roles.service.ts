import { Injectable } from '@nestjs/common';
import { listAccessRoles } from '@hbcfield/shared/microservices';
import { ServiceCalls } from '../../common/microservices/service-calls';
import { ApprovalRulesClient } from './approval-rules.client';

type RoleRow = { id: string; name: string; permissions?: Record<string, unknown>; memberCount?: number };

/** A reply's rows, whether or not it came wrapped in `{ data }`. */
const rowsOf = <T>(reply: unknown): T[] => ((reply as { data?: T[] })?.data ?? (reply as T[])) || [];

/**
 * The roles a rule may name, for the rules page: id, name, org or workspace, how many people hold it, and which
 * kinds its holders could approve (so the page marks a role that could never give the approval) — never a role's
 * permissions. `/organizations/roles` is for people who manage members; a rule manager needs only these facts.
 */
@Injectable()
export class ApprovalRuleRolesService {
  constructor(
    private readonly services: ServiceCalls,
    private readonly rules: ApprovalRulesClient,
  ) {}

  async list(organizationId: string) {
    const [org, space] = await Promise.all(
      (['org', 'space'] as const).map((scope) => this.services.auth.ask(listAccessRoles, { organizationId, scope })),
    );
    const all = [
      ...rowsOf<RoleRow>(org).map((r) => ({ r, inSpace: false })),
      ...rowsOf<RoleRow>(space).map((r) => ({ r, inSpace: true })),
    ].filter(({ r }) => Object.values(r.permissions ?? {}).some(Boolean));
    const kindsOf = await this.rules.roleKinds(
      organizationId,
      all.map(({ r }) => r.id),
    );
    return all.map(({ r, inSpace }) => ({
      id: r.id,
      name: r.name,
      inSpace,
      holders: r.memberCount ?? 0,
      decides: kindsOf?.[r.id] ?? [],
    }));
  }
}
