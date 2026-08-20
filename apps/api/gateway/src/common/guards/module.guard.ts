import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, minTierForFeature, AVAILABLE_MODULES, tierAllows, type PlanTier } from '@hbcfield/shared';
import { MODULE_KEY } from '../decorators/require-module.decorator';
import { isFeatureEntitled } from '../entitlements';
import { SpaceModulesService } from '../space-modules.service';

const MODULE_KEYS = new Set<string>(AVAILABLE_MODULES.map((m) => m.key));

/** Routes whose `:id` names a planning object that knows its own space. */
const PLANNING_ROUTES = [
  { segment: '/sprints', cmd: 'find_sprint' },
  { segment: '/phases', cmd: 'find_phase' },
  { segment: '/epics', cmd: 'find_epic' },
] as const;

/**
 * Rejects mutations whose required FEATURE module is not available.
 *
 * Two questions, and they have different scopes:
 *
 *   TIER   — what the organization pays for. Always organization-wide.
 *   MODULE — what is switched on, which is configured PER SPACE with the
 *            organization's set as the fallback.
 *
 * This used to ask both of the organization, off the cached token with no
 * lookup. That made a space's Modules tab decorative for everything except the
 * workflow gate: switching Checklists off in one space left the endpoint
 * accepting writes, because the organization still had it on.
 *
 * So the space is resolved — from an explicit spaceId on the request, or from
 * the task the request is about — and its modules decide. Both are cached (see
 * SpaceModulesService); an unresolvable space falls back to the organization,
 * because a guard that fails closed on a slow lookup takes a working feature
 * away from everyone.
 *
 * Returns 402 (same as PlanGuard) so the upgrade CTA fires consistently.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly spaceModules: SpaceModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    // Reads never hard-break on a downgrade — only gate mutations (mirrors PlanGuard).
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const user = req.user;
    if (!user) return true;

    // The tier question is the organization's, whatever space this touches.
    if (!tierAllows((user.planTier ?? null) as PlanTier | null, required)) {
      throw this.refuse(required);
    }
    // Capabilities (recurring, invoicing…) are tier-gated only — nothing to
    // switch on per space, so there is no space to resolve.
    if (!MODULE_KEYS.has(required)) return true;

    const spaceModules = await this.resolveSpaceModules(req, user);
    if (spaceModules) {
      if (!spaceModules.includes(required)) throw this.refuse(required, true);
      return true;
    }

    // No space in play (or it could not be resolved): the organization's set.
    if (!isFeatureEntitled(user, required)) throw this.refuse(required);
    return true;
  }

  /**
   * Whose modules govern this request.
   *
   * An explicit spaceId is trusted only as far as the org scoping in
   * `get_effective_modules`, which refuses a space belonging to another tenant —
   * so a forged id resolves to nothing and falls back rather than widening.
   */
  private async resolveSpaceModules(req: any, user: any): Promise<string[] | null> {
    const orgId = user.organizationId;
    if (!orgId) return null;

    /*
      The RESOURCE decides, and only then the request.

      Guards run before validation pipes, so this reads the raw body — including
      fields a DTO would go on to strip. Trusting a body-supplied spaceId first
      meant a mutation on a resource in one space could be judged against
      another space that happens to have the module on. Nothing exploitable
      today (forbidNonWhitelisted rejects the stray field a moment later), but
      it is one permissive DTO away from being a real bypass, and the resource's
      own space is the more correct answer regardless.

      An explicit spaceId still decides where there is no resource yet, which is
      creation — and there it IS the target.
    */
    const taskId = req.params?.taskId ?? (this.routeIs(req, '/tasks/') ? req.params?.id : null);
    if (typeof taskId === 'string' && taskId) {
      const spaceId = await this.spaceModules.spaceOfTask(taskId, orgId);
      if (spaceId) return this.spaceModules.forSpace(spaceId, orgId);
      return null;
    }

    /*
      Planning objects — a sprint, phase or epic — carry their own space now.
      A null spaceId means organization-wide, which is what every row created
      before they had a space still is.
    */
    const planning = PLANNING_ROUTES.find((r) => this.routeIs(req, r.segment));
    if (planning && typeof req.params?.id === 'string' && req.params.id) {
      const spaceId = await this.spaceModules.spaceOfPlanningObject(planning.cmd, req.params.id, orgId);
      if (spaceId) return this.spaceModules.forSpace(spaceId, orgId);
      return null;
    }

    const explicit = req.params?.spaceId ?? req.body?.spaceId ?? req.query?.spaceId ?? null;
    if (typeof explicit === 'string' && explicit) {
      return this.spaceModules.forSpace(explicit, orgId);
    }

    return null;
  }

  /** `:id` means a different thing per controller, so match on the path. */
  private routeIs(req: any, segment: string): boolean {
    const url: string = req.route?.path ?? req.originalUrl ?? req.url ?? '';
    return url.includes(segment);
  }

  private refuse(feature: string, fromSpace = false): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: fromSpace
          ? `The "${feature}" module is switched off in this space.`
          : `The "${feature}" feature is not available on your plan.`,
        error: fromSpace ? 'ModuleDisabled' : 'PlanUpgradeRequired',
        feature,
        ...(fromSpace ? {} : { requiredTier: minTierForFeature(feature) }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
