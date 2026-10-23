import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';

import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';

import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { SpaceReadService } from './space-read.service';
import { SpaceUpdateService } from './space-update.service';
import { SpaceLifecycleService } from './space-lifecycle.service';
import { SpaceRosterService } from './space-roster.service';
import { MemberSpacesService } from './member-spaces.service';
import { SpaceMembershipService } from './space-membership.service';
import { AssignmentTermsService } from './assignment-terms.service';
import { SpaceAnnouncer } from './space-announcer.service';

const SPACE_SERVICES = [
  SpacesService,
  SpaceReadService,
  SpaceUpdateService,
  SpaceLifecycleService,
  SpaceRosterService,
  MemberSpacesService,
  SpaceMembershipService,
  AssignmentTermsService,
];
import { SpacesProcessor } from './spaces.processor';

@Module({
  // Space and roster mutations announce themselves so open clients re-read
  // instead of going stale until someone refreshes.
  imports: [
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
      createClientOptions(SERVICE_NAMES.AUTH),
    ]),
  ],
  controllers: [SpacesController],
  providers: [...SPACE_SERVICES, SpaceAnnouncer, SpacesProcessor],
  exports: SPACE_SERVICES,
})
export class SpacesModule {}
