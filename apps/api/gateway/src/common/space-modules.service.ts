import {
  Global,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICE_NAMES, formatCents, moduleMonthlyCents } from '@hbcfield/shared';
import { sendRpc, findAssetSpace } from '@hbcfield/shared/microservices';
import { getEffectiveModules, findTaskSpace } from '@hbcfield/shared/microservices';
import type { ServiceErrorLike } from './request.types';

/** What these lookups read of a task-service reply. */
type SpaceLookupReply =
  | { success?: boolean; statusCode?: number; data?: { enabledModules?: unknown; spaceId?: string | null } }
  | null
  | undefined;

/**
 * The refusal for a module that is not on — ONE shape, 402, for ModuleGuard and
 * for every controller that asks a space directly. The hand-rolled checks used
 * to answer 403 with their own wording, so the web's upgrade prompt (which keys
 * on 402 + `feature`) never fired for the portal, units, sharing or CRM.
 */
export function moduleRefusal(feature: string, fromSpace = false): HttpException {
  // Both cases name a module and a price: switch it on in the space, and the
  // space is billed for it. There is no tier to upgrade to any more.
  const price = moduleMonthlyCents(feature);
  const priced = price > 0 ? ` (${formatCents(price)}/month)` : '';
  return new HttpException(
    {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      message: fromSpace
        ? `The "${feature}" module is switched off in this space.`
        : `The "${feature}" module is not switched on${priced}.`,
      error: 'ModuleDisabled',
      feature,
      moduleMonthlyCents: price,
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}

/**
 * Which feature modules apply to a given SPACE.
 *
 * Modules are configured per space, with the organization's set as the fallback
 * — that is what the space's Modules tab edits, and what the workflow gate has
 * always checked. Everything else read the organization's set off the cached
 * token instead, so turning Checklists off in one space changed nothing: the
 * section still rendered and the endpoint still accepted writes.
 *
 * Reading the space per request is the correct answer and a real cost on a hot
 * path, so it is cached. The window is deliberately short: switching a module
 * off should take effect while somebody is still looking at the screen they
 * switched it on, not a session later.
 *
 * A miss falls back to the organization's modules rather than to "nothing",
 * because failing closed here would take a working feature away from every
 * request the moment task-service hiccups.
 */
@Injectable()
export class SpaceModulesService {
  private readonly logger = new Logger(SpaceModulesService.name);

  /** spaceId → { modules, expires }. Small, bounded, per-process. */
  private readonly cache = new Map<string, { modules: string[]; expires: number }>();
  private static readonly TTL_MS = 30_000;
  /** A task changes space rarely, so this can be held far longer. */
  private static readonly TASK_TTL_MS = 5 * 60_000;
  private static readonly MAX_ENTRIES = 2_000;

  /** taskId → its spaceId. Separate map so the TTLs can differ. */
  private readonly taskSpace = new Map<string, { spaceId: string | null; expires: number }>();

  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  /**
   * The modules in force for this space, or null when they cannot be resolved
   * — the caller then keeps whatever it would have done without a space.
   */
  async forSpace(spaceId: string, organizationId: string): Promise<string[] | null> {
    const r = await this.lookup(spaceId, organizationId);
    return typeof r === 'string' ? null : r.modules;
  }

  /**
   * The space's modules, or WHY there are none: the space is not this
   * organization's (`missing`), or the service could not be asked
   * (`unavailable`). The guard treats both as "unknown"; an explicit check
   * answers them differently — a wrong id is not a reason to "try again".
   */
  private async lookup(
    spaceId: string,
    organizationId: string,
  ): Promise<{ modules: string[] } | 'missing' | 'unavailable'> {
    const key = `${organizationId}:${spaceId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return { modules: hit.modules };

    let res: SpaceLookupReply;
    try {
      res = await firstValueFrom(
        sendRpc(this.taskClient, getEffectiveModules, { id: spaceId, organizationId })
          // A guard must not hang a request while a service is slow. Falling
          // back to the org's modules is wrong-ish; blocking is worse.
          .pipe(timeout(1_500)),
      );
    } catch (caught: unknown) {
      const err = caught as ServiceErrorLike | undefined;
      const status = err?.status ?? err?.statusCode ?? err?.response?.statusCode;
      if (status === 404) return 'missing';
      this.logger.warn(`Could not resolve modules for space ${spaceId}: ${err?.message ?? err}`);
      return 'unavailable';
    }
    if (res?.success === false) return res?.statusCode === 404 || res?.statusCode === 400 ? 'missing' : 'unavailable';
    const modules: string[] | null = Array.isArray(res?.data?.enabledModules)
      ? res.data.enabledModules
      : Array.isArray(res?.data)
        ? res.data
        : null;
    if (!modules) return 'missing';
    this.remember(key, modules);
    return { modules };
  }

  /**
   * The space a task belongs to.
   *
   * Task routes carry a task id, not a space id, and the modules that govern a
   * task are its SPACE's. Cached hard: a task moves space rarely, and without
   * the cache this would put a lookup in front of every task mutation.
   */
  async spaceOfTask(taskId: string, organizationId: string): Promise<string | null> {
    const key = `task:${organizationId}:${taskId}`;
    const hit = this.taskSpace.get(key);
    if (hit && hit.expires > Date.now()) return hit.spaceId;

    try {
      const res: SpaceLookupReply = await firstValueFrom(
        // ⚠️ Its own pattern: `find_task` asks who is reading, and the guard has nobody to name.
        sendRpc(this.taskClient, findTaskSpace, { id: taskId, organizationId }).pipe(timeout(1_500)),
      );
      const spaceId: string | null = res?.data?.spaceId ?? null;
      this.rememberSpaceOf(key, spaceId);
      return spaceId;
    } catch {
      // Unresolvable → the caller keeps the organization's modules. A guard that
      // fails closed on a slow lookup takes a working feature away from everyone.
      return null;
    }
  }

  /**
   * The space an ASSET belongs to — through its kind.
   *
   * ⚠️ An asset has no `spaceId` of its own; it inherits its category's. Without
   * this the guard could not resolve a space for any `/assets/:id` write and
   * fell back to the ORGANIZATION's module set — so an organization that runs
   * assets in one workspace, which is the normal way to run them, was refused
   * with "the assets module is not switched on" while the module was plainly on.
   */
  async spaceOfAsset(assetId: string, organizationId: string): Promise<string | null> {
    const key = `asset:${organizationId}:${assetId}`;
    const hit = this.taskSpace.get(key);
    if (hit && hit.expires > Date.now()) return hit.spaceId;

    try {
      const res: SpaceLookupReply = await firstValueFrom(
        // ⚠️ Its own pattern: `find_asset` asks who is reading, and the guard has nobody to name.
        sendRpc(this.taskClient, findAssetSpace, { id: assetId, organizationId }).pipe(timeout(1_500)),
      );
      const spaceId: string | null = res?.data?.spaceId ?? null;
      this.rememberSpaceOf(key, spaceId);
      return spaceId;
    } catch {
      // Unresolvable → the organization's modules, as everywhere else here.
      return null;
    }
  }

  /**
   * The space a planning object belongs to — a sprint, phase or epic.
   *
   * These carry a nullable spaceId: null means organization-wide, which is what
   * every row created before spaces owned them still is. Null here therefore
   * means "no space governs this", not "lookup failed", and the caller falls
   * back to the organization either way.
   */
  async spaceOfPlanningObject(
    cmd: 'find_sprint' | 'find_phase' | 'find_epic',
    id: string,
    organizationId: string,
  ): Promise<string | null> {
    const key = `${cmd}:${organizationId}:${id}`;
    const hit = this.taskSpace.get(key);
    if (hit && hit.expires > Date.now()) return hit.spaceId;

    try {
      const res: SpaceLookupReply = await firstValueFrom(
        this.taskClient.send({ cmd }, { id, organizationId }).pipe(timeout(1_500)),
      );
      const spaceId: string | null = res?.data?.spaceId ?? null;
      this.rememberSpaceOf(key, spaceId);
      return spaceId;
    } catch {
      return null;
    }
  }

  private rememberSpaceOf(key: string, spaceId: string | null): void {
    if (this.taskSpace.size >= SpaceModulesService.MAX_ENTRIES) {
      const oldest = this.taskSpace.keys().next().value;
      if (oldest) this.taskSpace.delete(oldest);
    }
    this.taskSpace.set(key, { spaceId, expires: Date.now() + SpaceModulesService.TASK_TTL_MS });
  }

  /**
   * Refuse unless `feature` is switched on in THIS space.
   *
   * For routes whose whole surface IS one space's module (its portal, its
   * units, sharing it, filing a client into it) — reads included, which is why
   * they ask here rather than through @RequireModule, whose guard lets reads
   * through. Four controllers each carried a copy of this lookup; they now share
   * the cache and the 402 the guard answers with.
   *
   * Unlike the guard, an unresolvable space is NOT waved through on the
   * organization's set: these routes name the space explicitly, so not knowing
   * its modules is a failure to report (503), never a permission.
   */
  async assertEnabled(spaceId: string, organizationId: string, feature: string): Promise<void> {
    const r = await this.lookup(spaceId, organizationId);
    if (r === 'missing') throw new NotFoundException('Workspace not found');
    if (r === 'unavailable')
      throw new ServiceUnavailableException("Could not check this workspace's modules — try again");
    if (!r.modules.includes(feature)) throw moduleRefusal(feature, true);
  }

  /** Drop a space's entry so a module change is visible immediately. */
  invalidate(spaceId: string, organizationId: string): void {
    this.cache.delete(`${organizationId}:${spaceId}`);
  }

  private remember(key: string, modules: string[]): void {
    // Bounded rather than unbounded: an org with thousands of spaces should not
    // be able to grow this without limit. Oldest insertion goes first — good
    // enough for a 30-second window, and cheaper than tracking recency.
    if (this.cache.size >= SpaceModulesService.MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { modules, expires: Date.now() + SpaceModulesService.TTL_MS });
  }
}

/**
 * Global, because ModuleGuard is registered as APP_GUARD.
 *
 * Nest instantiates a guard with dependencies once per module that has
 * controllers, resolving them in THAT module's injector — so a provider listed
 * only in AppModule is missing everywhere except AppModule, and the app fails
 * to boot naming whichever module happens to be first (it was PhasesModule).
 *
 * A unit test cannot see this: it constructs the guard directly with a double.
 * Only starting the application does.
 */
@Global()
@Module({
  providers: [SpaceModulesService],
  exports: [SpaceModulesService],
})
export class SpaceModulesModule {}
