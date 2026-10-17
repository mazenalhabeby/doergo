import { WorkspacePlaceDetector } from '../calendar/workspace-place.detector';
import { Injectable, ForbiddenException } from '@nestjs/common';
import { isAdmin, accessAllows } from '@hbcfield/shared';
import { RebillService } from '../../common/billing/rebill.service';
import { spaceMemberAuthority } from '../space-roles/space-member-access';
import { SpaceModulesService } from '../../common/space-modules.service';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';
import { ChatReachLookup } from '../chat/chat-reach.lookup';

/**
 * What every /locations controller shares: re-billing after a change, and who may
 * manage a workspace's people.
 */
@Injectable()
export abstract class LocationsControllerBase {

  constructor(
    protected readonly locationsService: LocationsService,
    protected readonly locationsQueueService: LocationsQueueService,
    protected readonly billing: RebillService,
    protected readonly placeDetector: WorkspacePlaceDetector,
    protected readonly spaceModules: SpaceModulesService,
    protected readonly chatReach: ChatReachLookup,
  ) {}


  /**
   * Tell billing the bill moved. A space IS a billable thing: creating one,
   * switching a module on in it, archiving it, or changing who holds a role in
   * it moves what the organization owes (see RebillService).
   */
  protected rebill(organizationId: string): void {
    this.billing.rebill(organizationId);
  }

  /**
   * May the caller change who works in THIS workspace?
   *
   * The guard on `POST /locations/:id/members` reads a space id from
   * `params.spaceId`, `params.locationId` or the body — never `:id` — so for
   * this route it fell back to "granted in ANY space": a member who manages one
   * site could add people (and their roles, and their seat price) to every
   * other. Decided here against the space in the path.
   *
   * Two ways to hold it: the workspace grant the guard asks for, held org-wide
   * or in this space; or managing this space's people (which is what a CONTROL
   * guest holds in a space shared with them — the service then confines them
   * to their own people).
   */
  protected assertMayManageMembersIn(req: any, spaceId: string): void {
    if (isAdmin(req.user)) return;
    if (accessAllows(req.user?.access, 'canManageWorkspaces', spaceId)) return;
    // Adding people here (`canAddSpaceMembers`), or managing its people — one rule with the space-roles routes.
    if (spaceMemberAuthority(req.user, spaceId).addMembers) return;
    throw new ForbiddenException('You do not have permission to manage the members of this workspace');
  }
}
