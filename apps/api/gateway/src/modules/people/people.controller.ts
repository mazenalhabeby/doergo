import { Controller, Get, Inject, NotFoundException, Param, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { SpacesService } from '../spaces/spaces.service';
import { getSpaceScope } from '@hbcfield/shared';
import { ChatReachLookup } from '../chat/chat-reach.lookup';
import { sendRpc, listOrgContacts } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** A person row as the two lists return it — read loosely, passed on as it came. */
type PersonRow = { id?: string } & Record<string, unknown>;
const rowsOf = (r: unknown): PersonRow[] =>
  Array.isArray(r) ? r : Array.isArray((r as { data?: unknown } | null)?.data) ? (r as { data: PersonRow[] }).data : [];

/**
 * One person, as the caller's Team shows them — the phone's profile screen.
 *
 * ⚠️ Built FROM the two lists the caller may already read (colleagues in shared
 * workspaces, and the managers they may contact), never a query of its own: a
 * profile can therefore never show somebody, or something, Team would not.
 * Anybody else is 404 — the same answer as nobody.
 */
@ApiTags('people')
@ApiBearerAuth()
@Controller('people')
export class PeopleController {
  constructor(
    private readonly locations: SpacesService,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly chatReach: ChatReachLookup,
  ) {}

  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'A colleague as Team shows them, with whether you may message them' })
  async person(@Param('id') id: string, @Request() req: AuthedRequest) {
    const user = req.user;
    const [team, managers] = await Promise.all([
      this.locations.getColleagues({
        userId: user.id,
        organizationId: callerOrgId(user),
        spaceScope: getSpaceScope(user),
      }),
      firstValueFrom(
        sendRpc(this.authClient, listOrgContacts, { organizationId: user.organizationId, userId: user.id }),
      ),
    ]);
    const asColleague = rowsOf(team).filter((p) => p?.id === id);
    const asManager = rowsOf(managers).find((p) => p?.id === id);
    if (!asColleague.length && !asManager) throw new NotFoundException('Person not found');
    const base = { ...(asManager ?? {}), ...(asColleague[0] ?? {}) };
    const workspaces = [...new Set(asColleague.map((p) => p.spaceName).filter(Boolean))];
    const [marked] = await this.chatReach.annotate([base], user);
    return { success: true, data: { ...marked, isManager: !!asManager, workspaces } };
  }
}
